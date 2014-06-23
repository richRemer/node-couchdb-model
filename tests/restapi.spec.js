/* global describe, beforeEach, afterEach, it, emit */

/**
 * Unit tests for couchdb-model
 */

var should = require('chai').should();
var couchDBModel = require('../lib/couchdb-model.js'); 
var createNano = require('nano');
var extend = require('node.extend');
var Q = require('q');
var httpMocks = require('node-mocks-http');

var COUCHDB_BASE_URL = process.env.COUCHDB_BASE_URL;
if (!COUCHDB_BASE_URL) {
	throw new Error(
		'$COUCHDB_BASE_URL environment variable is not set. ' + 
		'Please provide a working couchdb base URL to run the tests.');
}

var COUCHDB_DB_NAME = process.env.COUCHDB_DB_NAME || 'couchdb-model-test';

var nano = createNano(COUCHDB_BASE_URL);

describe('couchdb-model REST API', function() {
	beforeEach(function(done) {
		nano.db.destroy(COUCHDB_DB_NAME, function() {
			nano.db.create(COUCHDB_DB_NAME, function(error) {
				if (error) throw error;
				done();
			});
		});
	});

	afterEach(function(done) {
		nano.db.destroy(COUCHDB_DB_NAME, function(error) {
			if (error) throw error;
			done();
		});
	});

	describe('GET /', function() {

		it('should create a request handler only if enabled', function() {
			var model = couchDBModel(nano.use(COUCHDB_DB_NAME), {
				restapi: {}	
			});
			model.onRequest.should.be.a('function');

			model = couchDBModel(nano.use(COUCHDB_DB_NAME), {
				restapi: null					
			});
			should.not.exist(model.onRequest);
		});

		it('should respond to GET / just like CouchDB', function(done) {
			var model = couchDBModel(nano.use(COUCHDB_DB_NAME), {
				restapi: {
					index: true	
				}
			});

			var elements = [
				model.create({ value: 'one' }),
				model.create({ value: 'two' })
			];

			var savePromises = [];
			elements.forEach(function(e) {
				savePromises.push(e.save());
			});

			Q.all(savePromises).then(function() {
				var req = httpMocks.createRequest({
					method: 'GET',
					url: '/'
				});	

				var res = httpMocks.createResponse();
				model.onRequest(req, res);

				setTimeout(function() {
					try {
						res.statusCode.should.equal(200, 'status code');
						var response = JSON.parse(res._getData());
						
						response.total_rows.should.equal(2);
					} catch (e) {
						done(e);
					}

					// compare with vanilla CouchDB response			
					Q.ninvoke(model._db, 'list').then(function(data) {
						try {
							data[0].should.deep.equal(response);
						} catch (e) {
							done(e)
						}
						done();
					}, function(error) {
						done(error)
					});
				}, 1000);
			});
		});	

		it('should respond to GET / correctly with prefix', function(done) {
			var model = couchDBModel(nano.use(COUCHDB_DB_NAME), {
				restapi: {
					prefix: '/testmodel',
					index: true	
				}
			});

			var elements = [
				model.create({ value: 'one' }),
				model.create({ value: 'two' })
			];

			var savePromises = [];
			elements.forEach(function(e) {
				savePromises.push(e.save());
			});

			Q.all(savePromises).then(function() {
				var req = httpMocks.createRequest({
					method: 'GET',
					url: '/testmodel/'
				});	

				var res = httpMocks.createResponse();
				model.onRequest(req, res);

				setTimeout(function() {
					try {
						res.statusCode.should.equal(200, 'status code');
						var response = JSON.parse(res._getData());
						
						response.total_rows.should.equal(2);
					} catch (e) {
						done(e);
					}

					// compare with vanilla CouchDB response			
					Q.ninvoke(model._db, 'list').then(function(data) {
						try {
							data[0].should.deep.equal(response);
						} catch (e) {
							return done(e)
						}
						done();
					}, function(error) {
						done(error)
					});
				}, 1000);
			});
		});	

		it('should deny GET / if index is disabled', function(done) {
			var model = couchDBModel(nano.use(COUCHDB_DB_NAME), {
				restapi: {
					index: false
				}
			});

			var req = httpMocks.createRequest({
				method: 'GET',
				url: '/'
			});	

			var res = httpMocks.createResponse();
			model.onRequest(req, res);

			setTimeout(function() {
				try {
					res.statusCode.should.equal(403, 'status code');
				} catch (e) {
					return done(e);
				}

				done();
			}, 1000);
		});
	});

	describe('GET /{id}', function() {
		it('should return the correct object', function(done) {
			var model = couchDBModel(nano.use(COUCHDB_DB_NAME), {
				restapi: {
					byID: true
				}
			});	

			var elements = [
				model.create({ _id: 'first', value: 'one' }),
				model.create({ _id: 'second', value: 'two' })
			];

			var savePromises = [];
			elements.forEach(function(e) {
				savePromises.push(e.save());
			});

			return Q.all(savePromises).then(function() {
				var req = httpMocks.createRequest({
					method: 'GET',
					url: '/second'
				});
					
				var res = httpMocks.createResponse();
				try {
					model.onRequest(req, res);
				} catch (e) {
					done(e);
				}

				setTimeout(function() {
					try {
						res.statusCode.should.equal(200, 'status code');
						var response = JSON.parse(res._getData());
						
						response.value.should.equal('two');

						// compare with vanilla CouchDB response			
						Q.ninvoke(model._db, 'get', 'second').then(
							function(data) {
							try {
								data[0].should.deep.equal(response);
							} catch (e) {
								return done(error);
							}

							done();
						}, function(error) {
							done(error);
						});
					} catch (e) {
						return done(e);
					}
				}, 1000);
			}, function() {
				done();
			}, function(error) {
				done(error);
			});
		});
	});
});
