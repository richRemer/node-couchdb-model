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

Q.longStackSupport = true;

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

	describe.skip('GET /', function() {

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

	describe.skip('GET /{id}', function() {
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

	describe('GET /{view}/{params}', function() {
		var db = nano.use(COUCHDB_DB_NAME);
		var model, dd, articles;
		// create test design document in the database
		beforeEach(function(done) {
			this.timeout(10000);

			dd = {
				_id: '_design/article',
				views: {
					by_date: {
						map: function(doc) {
							emit(doc.date, doc);
						}
					},
					by_tag: {
						map: function(doc) {
							if (Array.isArray(doc.tags)) {
								doc.tags.forEach(function(e) {
									emit(e, doc);
								});
							}
						}
					},
					by_slug: {
						map: function(doc) {
							emit(doc.slug, doc);
						}
					}
				}
			};

			model = couchDBModel(db, {
				views: [
					'_design/article/_view/by_date',
					{
						path: '_design/article/_view/by_tag',
						name: 'by_one_of_the_tags'
					},
					{
						path: '_design/article/_view/by_slug'
					}
				],
				restapi: {
					views: {
						byOneOfTheTags: false,
						bySlug: true
					}
				}
			});

			// test data
			articles = [
				model.create({
					_id: '0',
					date: "1970-01-01T00:00:00",
					slug: "test_article_that_is_super_old",
					tags: []
				}),
				model.create({
					_id: '1',
					date: "2013-03-24T05:22:31",
					slug: 'test_article_one_slug',
					tags: ['one', 'odd', 'test']
				}),
				model.create({
					_id: '2',
					date: "2014-03-24T05:00:00",
					slug: 'test_article_two_slug',
					tags: ['two', 'even', 'test']
				}),
				model.create({
					_id: '3',
					date: "2014-03-24T05:22:31",
					slug: 'test_article_three_slug',
					tags: ['three', 'odd', 'test']
				}),
				model.create({
					_id: '4',
					date: "2013-03-24T05:00:00",
					slug: 'test_article_four_slug',
					tags: ['four', 'even', 'test']
				}),
			];

			// build a promise array which saves the design docs and all
			// our articles
			//
			// Both nano and chouchdb-model implement the node callback 
			// pattern so we can use Q.ninvoke on them.
			var promises = [
				Q.ninvoke(db, 'insert', dd, dd._id)
			];

			articles.forEach(function(e) {
				promises.push(Q.ninvoke(e, 'save'));
			});

			// wait for every promise to be fulfilled before continuing
			Q.all(promises).then(
				function() { done(); }, 
				function(error) { done(error); }
			);
		});

		it('should not allow querying views that are not enabled', function(done) {
			// bySlug is enabled, byOneOfTheTags is not
			
			var request = httpMocks.createRequest({
				method: 'GET',
				url: '/by_one_of_the_tags/even'			
			});

			var response = httpMocks.createResponse();

			Q.delay(1000).then(function() {
				response.statusCode.should.equal(403);
			}).then(function() {
				done();	
			}, function(error) {
				done(error);
			});
			
			model.onRequest(request, response);
		});

		it('should respond 404 if a key is not found on a findOne request', 
			function(done) {
			// bySlug is enabled, byOneOfTheTags is not
			
			var request = httpMocks.createRequest({
				method: 'GET',
				url: '/by_slug/nonexistent'			
			});

			var response = httpMocks.createResponse();

			Q.delay(1000).then(function() {
				response.statusCode.should.equal(404);
			}).then(function() {
				done();	
			}, function(error) {
				done(error);
			});
			
			model.onRequest(request, response);
		});

		it('should return the same elements as model.findOneBySlug' +
			' on a findOne request', function(done) {
			var request = httpMocks.createRequest({
				method: 'GET',
				url: '/by_slug/test_article_one_slug'			
			});

			var response = httpMocks.createResponse();

			Q.all([
				model.findOneBySlug('test_article_one_slug'),
				Q.delay(1000)
			]).then(function(result) {
				result = result[0];
				response.statusCode.should.equal(200, 'status code');

				var responseData = JSON.parse(response._getData());

				responseData.should.deep.equal(result.toVO());
			}).then(function() {
			   done();
			}, function(error) {
				done(error);
			});
			
			model.onRequest(request, response);
		});	
	});
});
