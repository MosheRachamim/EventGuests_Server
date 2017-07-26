'use strict';
//consts.
var SQLMAXCONNECTIONS = 90;
var SERVER_PORT = 1337;
//dev
var SQL_URL = "212.179.232.90";
var SQL_User = "sa";
var SQL_Password ="123456";
var SQL_DB_Name =  "moshe";
//prod
//var SQL_URL = "81.218.117.73";
//var SQL_User = "wiselyev_wiselys";
//var SQL_Password = "KT{r#fI&fv9c";
//var SQL_DB_Name = "wiselyev_wisely_app_sit";

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var SocksConnection = require('socksjs');
var mysql = require('mysql2');
var soap = require('soap');
var url = require('url');
var proxyUrl = process.env.QUOTAGUARDSTATIC_URL;
//var fixieValues;
//if (fixieUrl) {
//	fixieValues = fixieUrl.split(new RegExp('[/(:\\/@)/]+'));
//}

var sms_url = 'http://www.smsapi.co.il/Web_API/SendSMS.asmx?wsdl';
var connPool;
if (proxyUrl ) {

	const mysqlServer = {
		host: SQL_URL,
		port: 3306,
		user: SQL_User,
		password: SQL_Password,
		database: SQL_DB_Name,
	};

	var proxy = url.parse(process.env.QUOTAGUARDSTATIC_URL),
		auth = proxy.auth,
		username = auth.split(':')[0],
		pass = auth.split(':')[1];

	const proxyConnection = new SocksConnection(mysqlServer, {
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
		stream: proxyConnection
	});

	console.log('connection made to db via Proxy');
}
else {
	connPool = mysql.createPool({
		connectionLimit: SQLMAXCONNECTIONS,
		host: SQL_URL,
		user: SQL_User,
		password: SQL_Password,
		database: SQL_DB_Name
	});

	console.log('connection made to db directly');
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
//api get view event
router.get('/view', function (req, res) {
	res.writeHead(200, { 'Content-Type': 'text/plain' });

	connPool.query("SELECT * FROM events", function (err, result, fields) {
		if (err) {
			logError(err, "/view");
			res.end("Error " + err);
			return;
			//throw err;
		}
		//console.log(result);
		res.end(JSON.stringify(result[0]));
	});

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
		//update db
		var lQuery = "Update guests set " +
			" new_handled_by=" + connPool.escape(req.body.HandledBy) + ", new_arrival_time ='" + req.body.LastUpdateDate +
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

// START THE SERVER
// =============================================================================
app.listen(port);
console.log('Event Guests Server is running on port ' + port);
