'use strict';
//consts.
//var SQLMAXCONNECTIONS = 90;
//wiselyevents:
//var SERVER_PORT = 1337;    //only relevant for local-hosting.
//leilot-ksumim:
var SERVER_PORT = 1338;    //only relevant for local-hosting.
//dev
//var SQL_URL = "localhost";
//var SQL_User = "sa";
//var SQL_Password = "123456";
//var SQL_DB_Name = "wiselyev_wisely_app_sit";
//prod1 (default)
//var SQL_URL = process.env.DB_HOSTURL || "81.218.117.73";
//var SQL_User = process.env.DB_USER || "wiselyev_wiselys";
//var SQL_Password = process.env.DB_PASSWORD || "sdasAA@$#FDSDFS";
//var SQL_DB_Name = process.env.DB_SCHEMA_NAME || "wiselyev_wisely_app_sit";

//prod2 (Dep2)
//var SQL_URL = process.env.DB_HOSTURL || "81.218.117.73";
//var SQL_User = process.env.DB_USER || "wiselyev_leilot_ksumim";
//var SQL_Password = process.env.DB_PASSWORD || "leilot_ksfI!fv9c";
//var SQL_DB_Name = process.env.DB_SCHEMA_NAME || "wiselyev_leilot_ksumim";

//prod3 (Heroku/Dep1)
//var SQL_URL = process.env.DB_HOSTURL || "eu-cdbr-west-01.cleardb.com";
//var SQL_User =process.env.DB_USER ||"b60386d15a4877";
//var SQL_Password =process.env.DB_PASSWORD||  "920be798";
//var SQL_DB_Name = process.env.DB_SCHEMA_NAME || "heroku_8fa7c59b81405c1";

//prod4 (Heroku/Dep2)
var SQL_URL = process.env.DB_HOSTURL || "us-cdbr-iron-east-05.cleardb.net";
var SQL_User =process.env.DB_USER ||"b1ca58a8bb5985";
var SQL_Password = process.env.DB_PASSWORD || "2537b76e";
var SQL_DB_Name = process.env.DB_SCHEMA_NAME || "heroku_c73124b25ab23c5";

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var SocksConnection = require('socksjs');
var mysql = require('mysql2');
var soap = require('soap');
var url = require('url');
var proxyUrl = process.env.QUOTAGUARDSTATIC_URL || process.env.FIXIE_SOCKS_HOST;
var hosted = process.env.DB_HOSTURL;
var moment = require('moment-timezone');
var StringBuilder = require('string-builder');

var sms_url = 'http://www.smsapi.co.il/Web_API/SendSMS.asmx?wsdl';

const mysqlServer = {
  host: SQL_URL,
  port: 3306
};

var clientTimeOffSet;
var proxyConnection;
var connPool;
if (proxyUrl) {

  /*Global proxyUrl */

  var proxy = url.parse(proxyUrl),
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
    //connectionLimit: SQLMAXCONNECTIONS,
    host: SQL_URL,
    user: SQL_User,
    password: SQL_Password,
    database: SQL_DB_Name,
    stream: proxyConnection,
    multipleStatements: true,
    connectTimeout: 30000,
    acquireTimeout: 30000,
    //queueLimit: 30,
    //timezone: "utc" + clientTimeOffSet,
    dateStrings: "DATETIME"
  });

  console.log('connection made to db via pool against (' + SQL_URL + ') via Proxy (' + proxyUrl + ')');
}
else {

  connPool = mysql.createPool({
    //connectionLimit: SQLMAXCONNECTIONS,
    host: SQL_URL,
    user: SQL_User,
    password: SQL_Password,
    database: SQL_DB_Name,
    multipleStatements: true,
    connectTimeout: 30000,
    acquireTimeout: 30000,
    //queueLimit: 30,
    //timezone: "utc" + clientTimeOffSet,
    dateStrings: "DATETIME"
  });


  console.log('connection made to db via pool against (' + SQL_URL + ') directly');
}

//registers to pool's OnConnection event.
connPool.on('connection', function (connection) {

  console.log("Pool- new connection created");
});

//capture timezone of the db server.
var GetSQLTimeZoneOffset = function () {
  connPool.query("select timediff(now(),convert_tz(now(),@@session.time_zone,'+00:00')) as val",
    function (err, result, fields) {
      if (err) {

        throw err; //Note: Throws from app if fails.
      }

      clientTimeOffSet = process.env.CLIENT_TIME_OFFSET || ("+" + result[0].val);
      console.log("Timezone offset = " + clientTimeOffSet);
    });
}();


function reconnectToDB() {
  /*Global proxyUrl */

  console.log('reconnectToDB');
  console.log('db connection restarting...');
  var proxy = url.parse(proxyUrl),
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
    //connectionLimit: SQLMAXCONNECTIONS,
    host: SQL_URL,
    user: SQL_User,
    password: SQL_Password,
    database: SQL_DB_Name,
    stream: proxyConnection,
    multipleStatements: true,
    connectTimeout: 30000,
    acquireTimeout: 30000,
    //queueLimit: 30,
    //timezone: "utc" + clientTimeOffSet,
    dateStrings: "DATETIME"
  });
  console.log('db connection restarted');

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
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });

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

});

//api get view event
router.get('/view', function (req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });

  connPool.query("SELECT * FROM events", function (err, result, fields) {
    if (err) {
      logError(err, "/view");
      if (req.query.autoWakeup == 'true') {

        //-reconnect to db.
        reconnectToDB();

        //-perform the query (after reconnect)
        connPool.query("SELECT * FROM events", function (err, result, fields) {
          if (err) {
            logError(err, "/view reconnect");
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
});


//api get view2 event(legacy)
router.get('/view2', function (req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });

  connPool.query("SELECT * FROM events", function (err, result, fields) {
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
});

//api get sms templates event
router.get('/get_sms_templates', function (req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  connPool.query("SELECT * FROM sms_templates", function (err, result, fields) {
    if (err) logError(err, "/get_sms_templates"); //throw err;
    //console.log(result);
    res.end(JSON.stringify(result));
  });

});

//api get sms credit
router.get('/get_sms_credits', function (req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });

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

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
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
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
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

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    //console.log(getTimeOfDay(req.body.LastUpdateDate));
    var sb = new StringBuilder();
    for (var i = 0; i < req.body.Items.length; i++) {
      //test
      var guest = req.body.Items[i];
      if (hosted && guest.HandledBy) {
        console.log('test1 ' + guest.LastUpdateDate);
        console.log('test2 ' + getTimeOfDayWithOffset(guest.LastUpdateDate));
        console.log('test3 ' + clientTimeOffSet);
      }
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

//api: bulk import guests
//clears all guests list and replaces with given items.

router.route('/bulkImport/')

  .post(function (req, res) {

    if (!req.body.Items)
      return;

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    console.log('here1');
    //clears guests list (IIFE).
    (function () {
      connPool.query("Truncate table guests",
        function (err, result, fields) {
          if (err) {
            logError(err, "/all");;
            return;
          }
        });
    })();

    //imports the new ones.
    console.log('here2');

    //console.log(getTimeOfDay(req.body.LastUpdateDate));
    var sb = new StringBuilder();
    var start = "Insert into guests(guest_id,event_id,name,table_number,num_guests,new_table_number,new_num_guests,new_arrival_time,new_handled_by,comments,phone,side,category) Values (";
    sb.appendLine(start);
    console.log('here3');
    for (var i = 0; i < req.body.Items.length; i++) {
      var guest = req.body.Items[i];
      var line = "[" + connPool.escape(guest.HandledBy) + "," + getTimeOfDay(guest.LastUpdateDate) +
        "', " + guest.NumOfGuestsAttending + ", " + guest.NumOfGuestsApproved +
        ", " + connPool.escape(guest.Name) + ", " + connPool.escape(guest.PhoneNumber) +
        ", " + connPool.escape(guest.Group) + ", " + connPool.escape(guest.WeddingSide) +
        ", " + connPool.escape(guest.TableNumber) + ", " + connPool.escape(guest.Comments) + "]";
      line = line.replace(/'null'/g, "null");  //fix for null values.
      sb.appendLine(line);
      if (i != (req.body.Items.length - 1)) {   //not last line.
        sb.append(",");
      }
    }
    sb.appendLine(")");
    console.log('here4');
    var query = sb.toString();
    //console.log(query);
    //update db
    console.log(query);
    return;
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

//helper function: convert datetime value to time only.
function getTimeOfDay(dateTime) {

  if (dateTime != null) {

    /*GLOBAL clientTimeOffSet*/
    console.log(dateTime);
    var datetimeUTC = new moment(dateTime).format("HH:mm:ss");
    console.log(datetimeUTC);

    return datetimeUTC;
  }
  else {
    return null;
  }
}

//helper function: convert datetime value to time only, in the client time offset.
function getTimeOfDayWithOffset(dateTime) {

  if (dateTime != null) {

    /*GLOBAL clientTimeOffSet*/
    //console.log(dateTime);
    var datetimeUTC = new moment(dateTime).utcOffset(clientTimeOffSet).format("HH:mm:ss");
    //console.log(datetimeUTC);

    return datetimeUTC;
  }
  else {
    return null;
  }
}


router.route('/sendStatsSms/')

  .post(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });

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
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });

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
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });

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
