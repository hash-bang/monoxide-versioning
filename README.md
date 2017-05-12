Monoxide-Versioning
===================
Versioning caching layer for the [Monoxide](https://github.com/hash-bang/Monoxide) ReST server.

This module is intended as a rapid-polling via ReST system where a serve record can be either the same version as before **or** mismatched. In the former case this module returns only a truncated version of the record (containing only `_id` + `__v`) rather than the whole record.


This module operates as a middleware layer which performs two actions:

* Checks if an incoming request contains a version string (by default `?__v=<SOMETHING>`). If it does it *only* returns a new version of the document if the version requested is older than the server one.
* Inserts itself as a late-call middleware layer item which updates its own cache.


```javascript
var app = express();
var port = 8181;
app.use(expressLogger);
app.use(bodyParser.json());
app.set('log.indent', '      ');

// Add middleware as an express chain
app.get('/api/users/:id', monoxideVersioning(), monoxide.express.get('users'));
```


Any request to `/api/users/1234` can take an optional `__v` query parameter. If this matches a truncated version of the document is returned (containing only `_id` + `__v`). If the version mismatches the entire document is returned.


API
---
This module exposes a single function-factory which is designed to slot into the ExpressJS middleware chain.
It accepts the following options:

| Option              | Type       | Description                                                                                                                                                                                                                                                           |
|---------------------|------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `idField`           | `function` | Function used to obtain the ID from the express req object. This defaults to using `req.params.id`                                                                                                                                                                    |
| `versionField`      | `function` | Function used to obtain the requested version from the express req object. This defaults to using `req.query.__v`
| `assumeVersion`     | `number`   | What value to assume when no version is explicitly passed. Set this to undefined to always return the full payload
| `hasher`            | `function` | Function that should return a string hash of what we need to hash against. This is usually the query + params of req
| `hashGet`           | `function` | Hash getting function to be called as (hash, cb). Defaults to the internal in-memory storage
| `hashSet`           | `function` | Hash setting function to be called as (hash, expire, cb). Defaults to the internal in-memory storage
| `hashRemove`        | `function` | Hash removal function to be called as (hash, cb). Defaults to the internal in-memory storage
| `hashClean`         | `function` | Hash cleaning function to be called as (cb). Defaults to the internal in-memory storage
| `hashExpire`        | `number`   | The time in milliseconds a hash should expire. Defaults to 1 hour
| `versionedResponse` | `function` | Function which should respond to Express if a hashed version is detected
| `model`             | `string` or `function` | The name of the current model to query against in `options.invalidates`. If this is a function it is run ONCE when the factory is invoked and its response used in all future calls. Defaults to a function which tries to match the model against `/api/<MODEL>/:id`
| `invalidates`       | `function` | Function which should determine if an incoming request invalidates the cache. Called as (req, res, id, version, cb). Defaults to pulling the record by its ID and checking its version if `options.model` is specified, otherwise uses req.method != 'GET'
