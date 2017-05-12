var _ = require('lodash');

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
		versionField: (req, res) => req.query.__v,
	});

	return function(req, res, next) {
		var id = settings.idField(req, res);
		if (!id) return next();
		var version = settings.versionField(req, res);
		if (!version) return next();

		console.log('MIDDLEWARE ON', id, version);
		next();
	};
};
