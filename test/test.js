var bodyParser = require('body-parser');
var expect = require('chai').expect;
var express = require('express');
var expressLogger = require('express-log-url');
var mlog = require('mocha-logger');
var monoxide = require('monoxide');
var monoxideVersioning = require('..');
var superagent = require('superagent');
var testSetup = require('./setup');

var app = express();
var server;

var port = 8181;
var url = 'http://localhost:' + port;

describe('monoxide-versioning middleware', function() {
	before(testSetup.init);
	after(testSetup.teardown);

	// Express Setup {{{
	before(function(finish) {
		this.timeout(10 * 1000);

		app.use(expressLogger);
		app.use(bodyParser.json());
		app.set('log.indent', '      ');

		app.get('/api/users', monoxide.express.query('users', {
			map: function(user) {
				user.nameParts = user.splitNames();
				return user;
			},
		}));

		// Add middleware as an express chain
		app.get('/api/users/:id', monoxideVersioning(), monoxide.express.get('users', {
			map: function(user) {
				user.nameParts = user.splitNames();
				return user;
			},
		}));
		app.post('/api/users', monoxide.express.create('users'));
		app.post('/api/users/:id', monoxide.express.save('users'));

		app.get('/api/widgets', monoxide.express.query('widgets'));
		app.get('/api/widgets/count', monoxide.express.count('widgets'));
		app.get('/api/widgets/meta', monoxide.express.meta('widgets'));
		app.get('/api/widgets/:id', monoxideVersioning(), monoxide.express.get('widgets'));
		app.post('/api/widgets', monoxide.express.create('widgets'));
		app.post('/api/widgets/:id', monoxide.express.save('widgets'));
		app.delete('/api/widgets/:id', monoxide.express.delete('widgets'));

		app.use('/api/groups/:id?', monoxide.express.middleware('groups', {
			meta: true, // Have to enable this as its off by default
			get: [monoxideVersioning()], // Add middleware as a monoxide.express property
		}));

		server = app.listen(port, null, function(err) {
			if (err) return finish(err);
			mlog.log('Server listening on ' + url);
			finish();
		});
	});

	after(function(finish) {
		server.close(finish);
	});
	// }}}

	// Fetch IDs {{{
	var users;
	before('should query users via ReST', function(finish) {
		superagent.get(url + '/api/users')
			.query({
				sort: 'name',
				populate: 'favourite',
			})
			.end(function(err, res) {
				expect(err).to.be.not.ok;

				users = res.body;
				expect(users).to.be.an.array;

				expect(users[0]).to.have.property('_id'); // All fields prefixed with '_' should be omitted by default, excepting _id, __v
				expect(users[0]).to.have.property('__v', 0);
				expect(users[0]).to.have.property('name', 'Jane Quark');
				expect(users[0]).to.have.property('role', 'user');
				expect(users[0]).to.not.have.property('_password');
				expect(users[0]).to.have.property('favourite');
				expect(users[0].favourite).to.be.an.object;
				expect(users[0].favourite).to.have.property('name', 'Widget bang');
				expect(users[0]).to.have.property('mostPurchased');
				expect(users[0].mostPurchased).to.be.an.array;
				expect(users[0].mostPurchased).to.have.length(2);
				expect(users[0].mostPurchased[0]).to.have.property('number', 1);
				expect(users[0].mostPurchased[0].item).to.be.a.string;
				expect(users[0].mostPurchased[1]).to.have.property('number', 2);
				expect(users[0].mostPurchased[1].item).to.be.a.string;
				expect(users[0]).to.have.property('nameParts'); // Check that the map function fired
				expect(users[0].nameParts).to.deep.equal(['Jane', 'Quark']);

				expect(users[1]).to.have.property('name', 'Joe Random');
				expect(users[1]).to.have.property('role', 'user');
				expect(users[1]).to.have.property('favourite');
				expect(users[1].mostPurchased).to.be.an.array;
				expect(users[1].mostPurchased).to.have.length(3);
				expect(users[1].mostPurchased[0]).to.have.property('number', 5);
				expect(users[1].mostPurchased[0].item).to.be.a.string;
				expect(users[1].mostPurchased[1]).to.have.property('number', 10);
				expect(users[1].mostPurchased[1].item).to.be.a.string;
				expect(users[1].mostPurchased[2]).to.have.property('number', 15);
				expect(users[1].mostPurchased[2].item).to.be.a.string;
				expect(users[1]).to.have.property('nameParts');
				expect(users[1].nameParts).to.deep.equal(['Joe', 'Random']);

				finish();
			});
	});

	var widgets;
	before('should query widgets via ReST', function(finish) {
		superagent.get(url + '/api/widgets')
			.query({
				sort: 'name',
			})
			.end(function(err, res) {
				expect(err).to.be.not.ok;

				widgets = res.body;
				expect(widgets).to.be.an.array;
				expect(widgets).to.have.length(3);

				expect(widgets[0]).to.have.property('name', 'Widget bang');
				expect(widgets[1]).to.have.property('name', 'Widget crash');
				expect(widgets[2]).to.have.property('name', 'Widget whollop');

				finish();
			});
	});
	// }}}

	it('GET user - un-versioned', function(finish) {
		superagent.get(url + '/api/users/' + users[0]._id)
			.query({
				populate: 'favourite',
			})
			.end(function(err, res) {
				expect(err).to.be.not.ok;

				var user = res.body;
				expect(user).to.be.an.object;

				expect(user).to.have.property('_id'); // All fields prefixed with '_' should be omitted by default, excepting _id, __v
				expect(user).to.have.property('__v', 0);
				expect(user).to.have.property('name', 'Jane Quark');
				expect(user).to.have.property('role', 'user');
				expect(user).to.not.have.property('_password');
				expect(user).to.have.property('favourite');
				expect(user.favourite).to.be.an.object;
				expect(user.favourite).to.have.property('name', 'Widget bang');
				expect(user).to.have.property('mostPurchased');
				expect(user.mostPurchased).to.be.an.array;
				expect(user.mostPurchased).to.have.length(2);
				expect(user.mostPurchased[0]).to.have.property('number', 1);
				expect(user.mostPurchased[0].item).to.be.a.string;
				expect(user.mostPurchased[1]).to.have.property('number', 2);
				expect(user.mostPurchased[1].item).to.be.a.string;

				expect(user).to.have.property('nameParts'); // Check that the map function fired
				expect(user.nameParts).to.deep.equal(['Jane', 'Quark']);

				finish();
			});
	});

	it('GET user - versioned (__v=0)', function(finish) {
		superagent.get(url + '/api/users/' + users[0]._id + '?__v=0')
			.query({
				populate: 'favourite',
			})
			.end(function(err, res) {
				expect(err).to.be.not.ok;

				var user = res.body;
				expect(user).to.be.an.object;

				expect(user).to.have.property('_id');
				expect(user).to.have.property('__v', 0);
				expect(user).to.not.have.property('name');
				expect(user).to.not.have.property('role');
				expect(user).to.not.have.property('_password');
				expect(user).to.not.have.property('favourite');
				expect(user).to.not.have.property('mostPurchased');
				expect(user).to.not.have.property('nameParts');

				finish();
			});
	});

	it('alter user #1', function(finish) {
		superagent.post(url + '/api/users/' + users[0]._id)
			.send({
				name: 'Jane Quark II',
			})
			.end(function(err, res) {
				expect(err).to.be.not.ok;

				var user = res.body;
				expect(user).to.be.an.object;

				expect(user).to.have.property('_id', users[0]._id);
				expect(user).to.have.property('__v', 1);
				expect(user).to.have.property('name', 'Jane Quark II');

				finish();
			});
	});

	it('GET user - versioned (__v=0 again, should invalidate)', function(finish) {
		superagent.get(url + '/api/users/' + users[0]._id + '?__v=0')
			.query({
				populate: 'favourite',
			})
			.end(function(err, res) {
				expect(err).to.be.not.ok;

				var user = res.body;
				expect(user).to.be.an.object;

				expect(user).to.have.property('_id');
				expect(user).to.have.property('__v', 1);
				expect(user).to.have.property('name', 'Jane Quark II');
				expect(user).to.have.property('role', 'user');
				expect(user).to.have.property('favourite');
				expect(user).to.have.property('mostPurchased');
				expect(user).to.have.property('nameParts');

				finish();
			});
	});

	it('alter user #2', function(finish) {
		superagent.post(url + '/api/users/' + users[0]._id)
			.send({
				name: 'Jane Quark III',
			})
			.end(function(err, res) {
				expect(err).to.be.not.ok;

				var user = res.body;
				expect(user).to.be.an.object;

				expect(user).to.have.property('_id', users[0]._id);
				expect(user).to.have.property('__v', 2);
				expect(user).to.have.property('name', 'Jane Quark III');

				finish();
			});
	});

	it('GET user - versioned (__v=2)', function(finish) {
		superagent.get(url + '/api/users/' + users[0]._id + '?__v=2')
			.query({
				populate: 'favourite',
			})
			.end(function(err, res) {
				expect(err).to.be.not.ok;

				var user = res.body;
				expect(user).to.be.an.object;

				expect(user).to.have.property('_id');
				expect(user).to.have.property('__v', 2);
				expect(user).to.not.have.property('name');
				expect(user).to.not.have.property('role');
				expect(user).to.not.have.property('favourite');
				expect(user).to.not.have.property('mostPurchased');
				expect(user).to.not.have.property('nameParts');

				finish();
			});
	});
});
