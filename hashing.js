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


/**
* Get whether a given hash exists
* @param {string} hash The hash to check for
* @param {function} cb The callback function to call as (err, exists)
*/
hashing.get = (hash, cb) => {
	cb(null, !! hashCache[hash]);
};


/**
* Store a hash
* @param {string} hash The hash to set
* @param {number} expire The millisecond offset from now that the hash should expire at
* @param {function} cb The callback function to call as (err)
*/
hashing.set = (hash, expire, cb) => {
	hashCache[hash] = Date.now() + expire;
	cb();
};


/**
* Invalidate and remove a hash
* @param {string} hash The hash to remove
* @param {function} cb The callback function to call as (err)
*/
hashing.remove = (hash, cb) => {
	delete hashCache[hash];
	cb();
}


/**
* Clean the hashing storage of all expired hashes
* @param {function} cb The callback function to call as (err)
*/
hashing.clean = cb => {
	var now = new Date.now();
	hashCache = _.pickBy(hashCache, v => v > now);
	cb();
}
