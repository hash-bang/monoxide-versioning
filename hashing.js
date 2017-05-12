/**
* Internal in-memory hashing for the monoxide-versioning middleware
*/

var hashing = {};
module.exports = hashing;


/**
* Internal hash storage
* Each key is a hash created by the .hasher() function with each value the expiry date of the hash
* @var {Object}
*/
var hashCache = {};

hashing.get = (hash, expire, cb) => {
	cb(null, !! hashCache[hash]);
};

hashing.set = (hash, expire, cb) => {
	hashCache[hash] = Date.now() + expire;
	cb();
};

hashing.remove = (hash, cb) => {
	delete hashCache[hash];
	cb();
}

hashing.clean = cb => {
	var now = new Date.now();
	hashCache = _.pickBy(hashCache, v => v > now);
	cb();
}
