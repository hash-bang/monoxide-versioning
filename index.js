var _ = require('lodash');
var async = require('async-chainable');
var hashing = require('./hashing');
var objectHash = require('object-hash');


/**
* Factory function which returns express middleware to selectively allow GET operations
* If the version provided in `req.query.__v` matches the current document version only the _id + __v fields are returned
* @param {Object} [options] Options for the returned middleware
* @param {function} [options.idField] Function used to obtain the ID from the express req object. This defaults to using `req.params.id`
* @param {function} [options.versionField] Function used to obtain the requested version from the express req object. This defaults to using `req.query.__v`
* @return {function} An express compatible middleware function
*/
module.exports = function(options) {
	var settings = _.defaults(options, {
		idField: (req, res) => req.params.id,
		versionField: (req, res) => req.query.__v !== undefined ? parseInt(req.query.__v) : undefined,
		assumeVersion: 0,
		hasher: (req, res, id, version, cb) => cb(null, objectHash.sha1({params: req.params, query: _.omit(req.query, '__v'), id: id, version: version})),
		hashGet: hashing.get,
		hashSet: hashing.set,
		hashRemove: hashing.remove,
		hashClean: hashing.clean,
		hashExpire: 60 * 60 * 1000, // 1 hour
		versionedResponse: (req, res, id, version, cb) => res.send({_id: id, __v: version}).end(),
		invalidates: (req, res, cb) => cb(null, req.method != 'GET'),
	});

	return function(req, res, expressContinue) {
		// Extract query ID {{{
		var id = settings.idField(req, res);
		if (id === undefined) return expressContinue();
		// }}}

		// Extract query version {{{
		var version = settings.versionField(req, res);
		if (version === undefined) {
			if (settings.assumeVersion === undefined) return expressContinue();
			version = settings.assumeVersion;
		}
		// }}}

		async()
			// Hash the request {{{
			.then('reqHash', function(next) {
				settings.hasher(req, res, id, version, next)
			})
			// }}}
			// Work out if we should invalidate - this is usually req.method!='GET' {{{
			.then('invalidated', function(next) {
				settings.invalidates(req, res, next);
			})
			// }}}
			// Fetch if a hashed response exists {{{
			.then('reqHashExists', function(next) {
				if (this.invalidated) {
					settings.hashRemove(this.reqHash, settings.hashExpire, next);
					return next('invalidated');
				} else {
					settings.hashGet(this.reqHash, settings.hashExpire, next);
				}
			})
			// }}}
			// ... if not plug into the json function in order to capture output and stash it {{{
			.then('resJSON', function(next) {
				if (this.reqHashExists) return next('hasHash');

				res._mv_json = res.json; // Store original JSON handler
				res.json = function(blob) {
					next(null, blob);
					return res;
				};
				res._mv_end = res.end;
				res.end = ()=> res; // Return the res object without doing anything - we handle the end later

				expressContinue();
			})
			// }}}
			// Compute a new hash for the response object {{{
			.then('resHash', function(next) {
				settings.hasher(req, res, this.resJSON._id, this.resJSON.__v, next);
			})
			// }}}
			// Setup a new hash {{{
			.then(function(next) {
				settings.hashSet(this.resHash, settings.hashExpire, next);
			})
			// }}}
			// End - respond with error, hashed value or original output {{{
			.end(function(err) {
				res.type('json');

				if (err && err == 'hasHash') { // Return a hashed value response
					settings.versionedResponse(req, res, id, version);
				} else if (err && err == 'invalidated') { // Cache invalidated but we don't want to have to deal with the workings
					expressContinue();
				} else if (err) {
					res.status(400).send(err);
				} else { // We don't want to handle this - return the full value
					res._mv_end(JSON.stringify(this.resJSON));
				}
			})
			// }}}
	};
};
