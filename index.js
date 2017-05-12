var _ = require('lodash');
var async = require('async-chainable');
var debug = require('debug')('monoxide-versioning');
var hashing = require('./hashing');
var monoxide = require('monoxide');
var objectHash = require('object-hash');


/**
* Factory function which returns express middleware to selectively allow GET operations
* If the version provided in `req.query.__v` matches the current document version only the _id + __v fields are returned
* @param {Object} [options] Options for the returned middleware
* @param {function} [options.idField] Function used to obtain the ID from the express req object. This defaults to using `req.params.id`
* @param {function} [options.versionField] Function used to obtain the requested version from the express req object. This defaults to using `req.query.__v`
* @param {number|string|undefined} [options.assumeVersion=0] What value to assume when no version is explicitly passed. Set this to undefined to always return the full payload
* @param {function} [options.hasher] Function that should return a string hash of what we need to hash against. This is usually the query + params of req
* @param {function} [options.hashGet] Hash getting function to be called as (hash, cb). Defaults to the internal in-memory storage
* @param {function} [options.hashSet] Hash setting function to be called as (hash, expire, cb). Defaults to the internal in-memory storage
* @param {function} [options.hashRemove] Hash removal function to be called as (hash, cb). Defaults to the internal in-memory storage
* @param {function} [options.hashClean] Hash cleaning function to be called as (cb). Defaults to the internal in-memory storage
* @param {number} [options.hashExpire] The time in milliseconds a hash should expire. Defaults to 1 hour
* @param {function} [options.versionedResponse] Function which should respond to Express if a hashed version is detected
* @param {string|function} [options.model] The name of the current model to query against in `options.invalidates`. If this is a function it is run ONCE when the factory is invoked and its response used in all future calls. Defaults to a function which tries to match the model against `/api/<MODEL>/:id`
* @param {function} [options.invalidates] Function which should determine if an incomming request invalidates the cache. Called as (req, res, id, version, cb). Defaults to pulling the record by its ID and checking its version if `options.model` is specified, otherwise uses req.method != 'GET'
* @return {function} An express compatible middleware function
*/
module.exports = function(options) {
	var settings = _.defaults(options, {
		idField: (req, res) => req.params.id,
		versionField: (req, res) => req.query.__v !== undefined ? parseInt(req.query.__v) : undefined,
		assumeVersion: 0,
		hasher: (req, res, id, version, cb) => cb(null, objectHash.sha1({params: req.params, query: _.omit(req.query, '__v'), id: id})),
		hashGet: hashing.get,
		hashSet: hashing.set,
		hashRemove: hashing.remove,
		hashClean: hashing.clean,
		hashExpire: 60 * 60 * 1000, // 1 hour
		versionedResponse: (req, res, id, version, cb) => res.send({_id: id, __v: version}).end(),
		invalidates: (req, res, id, version, cb) => {
			if (settings.model && monoxide.models[settings.model]) {
				monoxide.models[settings.model]
					.findOneByID(id)
					.select(['_id', '__v'])
					.exec(function(err, doc) {
						if (err) return cb(err);
						cb(null, doc.__v != version); // DB pull returned mismatched version
					});
			} else if (settings.model) {
				debug('Invalidates function given model', settings.model, 'but monoxide doesnt have it in monoxide.models!');
			} else {
				cb(null, req.method != 'GET');
			}
		},
		model: (req, res, cb) => {
			var [,model] = /^\/api\/(.+)\//.exec(req.path);
			if (model && monoxide.models[model]) {
				debug('Determined model', model, 'from path', req.path);
				cb(null, model);
			} else if (model) {
				debug('Determined model', model, 'from path', req.path, '- but Monoxide doesnt have an entry in monoxide.models[]');
				cb();
			} else {
				cb();
			}
		},
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
			// Eval settings.model (if a function) into a string from now on (should only run once) {{{
			.then(function(next) {
				if (!_.isFunction(settings.model)) return next();
				settings.model(req, res, function(err, model) {
					if (err) return next(err);
					settings.model = model;
					next();
				});
			})
			// }}}
			// Hash the request {{{
			.then('reqHash', function(next) {
				settings.hasher(req, res, id, version, next)
			})
			// }}}
			// Work out if we should invalidate - this is usually req.method!='GET' {{{
			.then('invalidated', function(next) {
				settings.invalidates(req, res, id, version, next);
			})
			// }}}
			// Fetch if a hashed response exists {{{
			.then('reqHashExists', function(next) {
				if (this.invalidated) {
					settings.hashRemove(this.reqHash, next);
					return next('invalidated');
				} else {
					settings.hashGet(this.reqHash, next);
				}
			})
			// }}}
			// ... if not plug into the JSON function in order to capture output and stash it {{{
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
