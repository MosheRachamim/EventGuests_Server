'use strict';
//consts.
var SQLMAXCONNECTIONS = 90;
var SERVER_PORT = 1337;
var USE_DBPoolDefault = true;
//dev
//var SQL_URL = "localhost";
//var SQL_User = "sa";
//var SQL_Password = "123456";
//var SQL_DB_Name = "wiselyev_wisely_app_sit";
//prod
var SQL_URL = "81.218.117.73";
var SQL_User = "wiselyev_wiselys";
var SQL_Password = "sdasAA@$#FDSDFS";
var SQL_DB_Name = "wiselyev_wisely_app_sit";

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var SocksConnection = require('socksjs');
var mysql = require('mysql2');
var soap = require('soap');
var url = require('url');
var proxyUrl = process.env.QUOTAGUARDSTATIC_URL;
var Use_DBPool = !proxyUrl || (process.env.Use_DBPool && USE_DBPoolDefault);
var moment = require('moment-timezone');
var StringBuilder = require('string-builder');

var sms_url = 'http://www.smsapi.co.il/Web_API/SendSMS.asmx?wsdl';

const mysqlServer = {
	host: SQL_URL,
	port: 3306
};

var proxyConnection;
var connPool;
if (proxyUrl) {


	var proxy = url.parse(process.env.QUOTAGUARDSTATIC_URL),
		auth = proxy.auth,
		username = auth.split(':')[0],
		pass = auth.split(':')[1];

	proxyConnection = new SocksConnection(mysqlServer, {
		host: proxy.hostname,
		port: 1080,
		user: username,
		pass: pass,
	});

	if (Use_DBPool) {

		connPool = mysql.createPool({
			connectionLimit: SQLMAXCONNECTIONS,
			host: SQL_URL,
			user: SQL_User,
			password: SQL_Password,
			database: SQL_DB_Name,
			stream: proxyConnection,
			multipleStatements: true,
			queueLimit: 30,
			acquireTimeout: 90000
		});

		connPool.on('connection', function (connection) {

			console.log("Pool- new connection created");
		});

		console.log('connection made to db via pool against (' + SQL_URL + ') via Proxy');

	} else {

		console.log('working w/out connection pool against url: ' + SQL_URL);
	}
}
else {

	connPool = mysql.createPool({
		connectionLimit: SQLMAXCONNECTIONS,
		host: SQL_URL,
		user: SQL_User,
		password: SQL_Password,
		database: SQL_DB_Name,
		multipleStatements: true,
		queueLimit: 30,
		acquireTimeout: 90000
	});

	connPool.on('connection', function (connection) {

		console.log("Pool- new connection created");
	});

	console.log('connection made to db via pool against (' + SQL_URL + ') directly');

}

function reconnectToDB() {
	console.log('reconnectToDB');
	if (Use_DBPool) {

		console.log('db connection restarting...');
		var proxy = url.parse(process.env.QUOTAGUARDSTATIC_URL),
			auth = proxy.auth,
			username = auth.split(':')[0],
			pass = auth.split(':')[1];

		proxyConnection = new SocksConnection(mysqlServer, {
			host: proxy.hostname,
			port: 1080,
			user: username,
			pass: pass,
		});
		connPool = mysql.createPool({
			connectionLimit: SQLMAXCONNECTIONS,
			host: SQL_URL,
			user: SQL_User,
			password: SQL_Password,
			database: SQL_DB_Name,
			stream: proxyConnection,
			multipleStatements: true,
			acquireTimeout: 90000,
			queueLimit: 30
		});
		console.log('db connection restarted');

	}
}

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

var port = process.env.PORT || SERVER_PORT;        // set our port

// ROUTES FOR OUR API
// =============================================================================
var router = express.Router();              // get an instance of the express Router

// test route to make sure everything is working (accessed at GET http://localhost:8080/api)
router.get('/', function (req, res) {
	res.json({ message: 'hooray! welcome to our api!' });
});

function logError(err, location) {
	var dateNow = new Date().toISOString().
		replace(/T/, ' ').      // replace T with a space
		replace(/\..+/, '');    // delete the dot and everything after
	console.log(dateNow + " - " + location + " - " + err);

}


//api get wakeup event
router.get('/wakeup', function (req, res) {
	res.writeHead(200, { 'Content-Type': 'text/plain' });

	if (Use_DBPool) {

		//-make dummy call to db.
		connPool.query("SELECT * FROM events",
			function (err, result, fields) {
				if (err) {
					//-in case error force reconnect.
					reconnectToDB();

					//-then try again.
					connPool.query("SELECT * FROM events",
						function (err, result, fields) {
							if (err) {

								//throw if fail.
								console.log('Wakup DB error');
								res.end('DB Error');
								return;
							}

							//-send response ok.
							res.end('DB OK 2');
						});
					return;
				}

				//-send response ok.
				res.end('DB OK 1');
			});

	}
});

//api get view event
router.get('/view', function (req, res) {
	res.writeHead(200, { 'Content-Type': 'text/plain' });

	if (Use_DBPool) {

		connPool.query("SELECT * FROM events", function (err, result, fields) {
			if (err) {
				logError(err, "/view");
				res.end("Error " + err);
				return;
			}
			res.end(JSON.stringify(result[0]));
		});
	} else {


		// Creates connection object.
		var conn = mysql.createConnection({

			host: SQL_URL,
			user: SQL_User,
			password: SQL_Password,
			database: SQL_DB_Name,
			stream: proxyConnection,
			multipleStatements: true
		});

		// connect to mysql
		conn.connect(function (err) {
			// in case of error
			if (err) {
				logError(err, "/view");
				res.end("Error while establishing sql connection: " + err);
				return;
				//throw err;
			}
			console.log("sql connection established");
		});

		// Perform a query
		conn.query('SELECT * FROM events', function (err, result, fields) {
			if (err) {
				logError(err, "/view");
				res.end("Error " + err);
				if (conn) {

					// Close the connection
					conn.end(function () {
						console.log("sql connection closed");

						// The connection has been closed
					});
				}
				return;
			}

			res.end(JSON.stringify(result[0]));
			console.log("sql query performed successully");
			if (conn) {

				// Close the connection
				conn.end(function () {
					console.log("sql connection closed");

					// The connection has been closed
				});
			}
		});
	}

});

//api get view2 event
router.get('/view2', function (req, res) {
	res.writeHead(200, { 'Content-Type': 'text/plain' });

	if (Use_DBPool) {

		connPool.query("SELECT * FROM events", function (err, result, fields) {
			if (req.query.autoWakeup == 'true') {
				console.log('test1 ' + 1 + ' - ' + req.query.autoWakeup);

			} else {
				console.log('test1 ' + 2 + ' - ' + req.query.autoWakeup);
				
			}
			if (err) {
				logError(err, "/view2");
				if (req.query.autoWakeup == 'true') {

					//-reconnect to db.
					reconnectToDB();

					//-perform the query (after reconnect)
					connPool.query("SELECT * FROM events", function (err, result, fields) {
						if (err) {
							logError(err, "/view2 reconnect");
							res.end("Error 1 " + err);
							return;
						}
						res.end(JSON.stringify(result[0]));
					});
				} else {

					res.end("Error 2 " + err);
				}
				return;
			}
			res.end(JSON.stringify(result[0]));
		});
	} else {


		// Creates connection object.
		var conn = mysql.createConnection({

			host: SQL_URL,
			user: SQL_User,
			password: SQL_Password,
			database: SQL_DB_Name,
			stream: proxyConnection,
			multipleStatements: true
		});

		// connect to mysql
		conn.connect(function (err) {
			// in case of error
			if (err) {
				logError(err, "/view");
				res.end("Error while establishing sql connection: " + err);
				return;
				//throw err;
			}
			console.log("sql connection established");
		});

		// Perform a query
		conn.query('SELECT * FROM events', function (err, result, fields) {
			if (err) {
				logError(err, "/view");
				res.end("Error " + err);
				if (conn) {

					// Close the connection
					conn.end(function () {
						console.log("sql connection closed");

						// The connection has been closed
					});
				}
				return;
			}

			res.end(JSON.stringify(result[0]));
			console.log("sql query performed successully");
			if (conn) {

				// Close the connection
				conn.end(function () {
					console.log("sql connection closed");

					// The connection has been closed
				});
			}
		});
	}

});

//api get sms templates event
router.get('/get_sms_templates', function (req, res) {
	res.writeHead(200, { 'Content-Type': 'text/plain' });
	connPool.query("SELECT * FROM sms_templates", function (err, result, fields) {
		if (err) logError(err, "/get_sms_templates"); //throw err;
		//console.log(result);
		res.end(JSON.stringify(result));
	});

});

//api get sms credit
router.get('/get_sms_credits', function (req, res) {
	res.writeHead(200, { 'Content-Type': 'text/plain' });

	soap.createClient(sms_url, function (err, client) {
		if (err) {
			logError(err, "/get_sms_credits");
			res.end("Error " + err);
			return;
		}

		var x = "<SMS>\r\n<CMD>CREDITS</CMD>\r\n<USERNAME>040553513</USERNAME>\r\n<PASSWORD>MeshiChen11</PASSWORD>\r\n</SMS>";
		var sms_args = {
			XMLString: x
		};
		client.COMMANDS(sms_args, function (err, result) {
			if (!err && result.COMMANDSResult != null) {
				res.end("OK " + result.COMMANDSResult);
			}
			else {

				logError(err, "/get_sms_credits");
				res.end("Error: " + err);
			}
			console.log(JSON.stringify(result));

		});
	});

});

//api get all guests
router.get('/all', function (req, res) {

	res.writeHead(200, { 'Content-Type': 'text/plain' });
	connPool.query("SELECT * FROM guests", function (err, result, fields) {
		if (err) {
			logError(err, "/all");;
			res.end("Error " + err);
			return;
		}
		res.end(JSON.stringify(result));
	});
	//console.log(new Date() + " - " + "/all" + " - " + "error");

});


//api: update guest approved

router.route('/update/:guest_id')

	.post(function (req, res) {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		//console.log(getTimeOfDay(req.body.LastUpdateDate));
		//update db
		var lQuery = "Update guests set " +
			" new_handled_by=" + connPool.escape(req.body.HandledBy) + ", new_arrival_time ='" + getTimeOfDay(req.body.LastUpdateDate) +
			"', new_num_guests=" + req.body.NumOfGuestsAttending + ", num_guests=" + req.body.NumOfGuestsApproved +
			", Name=" + connPool.escape(req.body.Name) + ", phone =" + connPool.escape(req.body.PhoneNumber) +
			", category =" + connPool.escape(req.body.Group) + ", side =" + connPool.escape(req.body.WeddingSide) +
			", table_number =" + connPool.escape(req.body.TableNumber) + ", comments =" + connPool.escape(req.body.Comments) +
			" where guest_id=" + req.params.guest_id;
		lQuery = lQuery.replace(/'null'/g, "null");  //fix for null values.
		//console.log(lQuery);
		connPool.query(lQuery, function (err, result, fields) {
			if (err) {
				logError(err, "/update");
				res.end("Error " + err);
				return;
			}
			//console.log(result);
			res.end(JSON.stringify(result));
		});

		//send sms.
		if (req.body.SMSMessageText == null) {
			return;
		}
		soap.createClient(sms_url, function (err, client) {
			if (err) {
				logError(err, "/update");
				res.end("Error " + err);
				return;
			}
			var sms_args = {
				XMLString: "<SMS>\r\n<USERNAME>040553513</USERNAME>\r\n<PASSWORD>MeshiChen11</PASSWORD>\r\n<SENDER_PREFIX>ALFA</SENDER_PREFIX>\r\n<SENDER_SUFFIX><![CDATA[WiselyEvent]]></SENDER_SUFFIX>\r\n<MSGLNG>HEB</MSGLNG>\r\n<MSG><![CDATA[" + req.body.SMSMessageText + "]]></MSG>\r\n<MOBILE_LIST>\r\n <MOBILE_NUMBER>" + req.body.PhoneNumber + "</MOBILE_NUMBER>\r\n</MOBILE_LIST>\r\n<UNICODE>False</UNICODE>\r\n<USE_PERSONAL>False</USE_PERSONAL>\r\n</SMS>"
			};

			client.SUBMITSMS(sms_args, function (err, result) {
				if (err || !result.SUBMITSMSResult.startsWith("Submit OK")) {
					logError(err, "/update");

				}
				console.log(result);
			});
		});

	});

//api: bulk update guest approved

router.route('/bulkupdate/')

	.post(function (req, res) {

		if (!req.body.Items)
			return;

		res.writeHead(200, { 'Content-Type': 'text/plain' });
		//console.log(getTimeOfDay(req.body.LastUpdateDate));
		var sb = new StringBuilder();
		for (var i = 0; i < req.body.Items.length; i++) {
			var guest = req.body.Items[i];
			var lQueryOne = "Update guests set " +
				" new_handled_by=" + connPool.escape(guest.HandledBy) + ", new_arrival_time ='" + getTimeOfDay(guest.LastUpdateDate) +
				"', new_num_guests=" + guest.NumOfGuestsAttending + ", num_guests=" + guest.NumOfGuestsApproved +
				", Name=" + connPool.escape(guest.Name) + ", phone =" + connPool.escape(guest.PhoneNumber) +
				", category =" + connPool.escape(guest.Group) + ", side =" + connPool.escape(guest.WeddingSide) +
				", table_number =" + connPool.escape(guest.TableNumber) + ", comments =" + connPool.escape(guest.Comments) +
				" where guest_id=" + guest.GuestId + ";";
			lQueryOne = lQueryOne.replace(/'null'/g, "null");  //fix for null values.
			sb.appendLine(lQueryOne);
		}
		var query = sb.toString();
		//console.log(query);
		//update db
		//console.log(lQuery);
		connPool.query(query, function (err, result, fields) {
			if (err) {
				logError(err, "/update");
				res.end("Error " + err);
				return;
			}
			//console.log(result);
			res.end(JSON.stringify(result));
		});

		req.body.Items.forEach(function (guest) {

			//send sms.
			if (guest.SMSMessageText == null) {
				return;
			}
			soap.createClient(sms_url, function (err, client) {
				if (err) {
					logError(err, "/update");
					res.end("Error " + err);
					return;
				}
				var sms_args = {
					XMLString: "<SMS>\r\n<USERNAME>040553513</USERNAME>\r\n<PASSWORD>MeshiChen11</PASSWORD>\r\n<SENDER_PREFIX>ALFA</SENDER_PREFIX>\r\n<SENDER_SUFFIX><![CDATA[WiselyEvent]]></SENDER_SUFFIX>\r\n<MSGLNG>HEB</MSGLNG>\r\n<MSG><![CDATA[" + guest.SMSMessageText + "]]></MSG>\r\n<MOBILE_LIST>\r\n <MOBILE_NUMBER>" + guest.PhoneNumber + "</MOBILE_NUMBER>\r\n</MOBILE_LIST>\r\n<UNICODE>False</UNICODE>\r\n<USE_PERSONAL>False</USE_PERSONAL>\r\n</SMS>"
				};

				client.SUBMITSMS(sms_args, function (err, result) {
					if (err || !result.SUBMITSMSResult.startsWith("Submit OK")) {
						logError(err, "/update");

					}
					console.log(result);
				});
			});
		});

	});

//helper function: convert datetime value to time
function getTimeOfDay(dateTime) {

	if (dateTime != null) {

		var datetimeUTC = new moment(dateTime).format("HH:mm:ss");

		return datetimeUTC;
	}
	else {
		return null;
	}
}

router.route('/sendStatsSms/')

	.post(function (req, res) {
		res.writeHead(200, { 'Content-Type': 'text/plain' });

		soap.createClient(sms_url, function (err, client) {
			if (err) {
				logError(err, "/sendStatsSms");
				res.end("Error " + err);
				return;
			}
			var sms_args = {
				XMLString: "<SMS>\r\n<USERNAME>040553513</USERNAME>\r\n<PASSWORD>MeshiChen11</PASSWORD>\r\n<SENDER_PREFIX>ALFA</SENDER_PREFIX>\r\n<SENDER_SUFFIX><![CDATA[WiselyEvent]]></SENDER_SUFFIX>\r\n<MSGLNG>HEB</MSGLNG>\r\n<MSG><![CDATA[" + req.body.SMSMessageText + "]]></MSG>\r\n" + req.body.PhoneNumbersXML + "\r\n<UNICODE>False</UNICODE>\r\n<USE_PERSONAL>False</USE_PERSONAL>\r\n</SMS>"
			};

			client.SUBMITSMS(sms_args, function (err, result) {
				if (!err && result.SUBMITSMSResult.startsWith("Submit OK")) {

					res.end("OK");
				} else {
					logError(err, "/sendStatsSms");
					res.end("Error: " + err + "\r\n" + JSON.stringify(result));
				}
				console.log(result);

			});
		});

	});

router.route('/sendAttendingSms/')

	.post(function (req, res) {
		res.writeHead(200, { 'Content-Type': 'text/plain' });

		soap.createClient(sms_url, function (err, client) {
			if (err) {
				logError(err, "/sendAttendingSms");
				res.end("Error " + err);
				return;
			}
			var sms_args = {
				XMLString: "<SMS>\r\n<USERNAME>040553513</USERNAME>\r\n<PASSWORD>MeshiChen11</PASSWORD>\r\n<SENDER_PREFIX>ALFA</SENDER_PREFIX>\r\n<SENDER_SUFFIX><![CDATA[WiselyEvent]]></SENDER_SUFFIX>\r\n<MSGLNG>HEB</MSGLNG>\r\n<MSG><![CDATA[" + req.body.SMSMessageText + "]]></MSG>\r\n" + req.body.PhoneNumbersXML + "\r\n<UNICODE>False</UNICODE>\r\n<USE_PERSONAL>False</USE_PERSONAL>\r\n</SMS>"
			};

			client.SUBMITSMS(sms_args, function (err, result) {
				if (!err && result.SUBMITSMSResult.startsWith("Submit OK")) {

					res.end("OK");
				} else {
					logError(err, "/sendAttendingSms");
					res.end("Error: " + err + "\r\n" + JSON.stringify(result));
				}
				console.log(result);

			});
		});

	});


router.route('/sendMissingGuestsSms/')

	.post(function (req, res) {
		res.writeHead(200, { 'Content-Type': 'text/plain' });

		soap.createClient(sms_url, function (err, client) {
			if (err) {
				logError(err, "/sendMissingGuestsSms");
				res.end("Error " + err);
				return;
			}
			var x = "<SMS>\r\n<USERNAME>040553513</USERNAME>\r\n<PASSWORD>MeshiChen11</PASSWORD>\r\n<SENDER_PREFIX>ALFA</SENDER_PREFIX>\r\n\r\n<SENDER_SUFFIX><![CDATA[WiselyEvent]]></SENDER_SUFFIX>\r\n<MSGLNG>HEB</MSGLNG>\r\n" + req.body.PhoneNumbersAndTextXML + "\r\n<MSG></MSG>\r\n<UNICODE>False</UNICODE>\r\n<USE_PERSONAL>True</USE_PERSONAL>\r\n</SMS>";
			var sms_args = {
				XMLString: x
			};
			//res.end("OK " + x.length);
			//console.log(x);
			client.SUBMITSMS(sms_args, function (err, result) {
				if (!err && result.SUBMITSMSResult.startsWith("Submit OK")) {
					res.end("OK");
				}
				else {

					logError(err, "/sendMissingGuestsSms");
					res.end("Error: " + err + "\r\n" + JSON.stringify(result));
				}
				console.log(result);

			});
		});

	});




// more routes for our API will happen here

// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/wizelyapi1', router);

process.on('exit', function () {
	// Add shutdown logic here.
	pool.end(function (err) {
		if (err != null) {
			// all connections in the pool have ended
			logError(err, "close sql pool");
		}
	});

});

//process.on('uncaughtException', function (err) {
//	// MySql Handle
//	if (!proxyUrl) {
//		return;
//	}
//	console.log('unhandled: '+ JSON.stringify(err));
//	//if ('code' in err) {
//	//	if (err.code === 'ECONNREFUSED') {

//	//		//-Recreate the pool.
//	//		connPool = mysql.createPool({
//	//			connectionLimit: SQLMAXCONNECTIONS,
//	//			host: SQL_URL,
//	//			user: SQL_User,
//	//			password: SQL_Password,
//	//			database: SQL_DB_Name,
//	//			stream: proxyConnection,
//	//			multipleStatements: true,
//	//		});
//	//	}
//	//}
//});

// START THE SERVER
// =============================================================================
app.listen(port);
console.log('Event Guests Server is running on port ' + port);
