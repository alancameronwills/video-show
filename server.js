// server.js

const http = require('http');
const util = require('util');
const fs = require('fs/promises');

const { argv } = require('process');

const logverbose = false;


const credentials = "Basic OnZsYw==";  // vlc //await getCredentials(root, argv?.[3]);

const contentTypes = {
	".css": "text/css",
	".htm": "text/html", ".html": "text/html",
	".gif": "image/gif",
	".jpg": "image/jpeg", ".jpeg": "image/jpeg",
	".js": "text/js",
	".json": "application/json",
	".mp3": "audio/mpeg", ".mp4": "video/mp4", ".mpeg": "video/mpeg",
	".png": "image/png",
	".pdf": "application/pdf",
	".txt": "text/plain"
};


let report = {}; // most recent state of player

(async () => {
	let root = await fs.realpath('.');
	root = root.replace("/server", "");
	donationLog = `${root}/log-donations.log`;
	const clientRoot = `${root}/`;


	const handlers = {
		"get-url": getUrl,
		"detector": toggleDetector,
		"operation": operation,
		"list-slides": listSlides,
		"ping": async () => { return { body: 'pong', status: 200, contentType: "text/plain" } },
	};

	function serve(request, response) {
		try {
			let req = parseReq(request);
			let contentType = contentTypes[req.extension] ?? "";
			req.path = req.path.replace("\/video-show\/", "/");
			req.contentType = contentType;

			if (!contentType) {
				let recognized = false;
				for (let k of Object.keys(handlers)) {
					if (req.path.indexOf("/" + k) == 0) {
						(async () => {
							try {
								let reply = await handlers[k](req.params, clientRoot);
								response.writeHead(reply.status, { "Content-Type": reply.contentType });
								response.end(reply.body);
							} catch (err) {
								log("Handler exception: " + util.inspect(err));
							}
						})()
						recognized = true;
					}
				}
				if (!recognized) {
					response.writeHead("404", "text/plain");
					response.end("Not found: " + req.path);
				}
			} else {
				let reply = util.inspect(req);
				let replyType = "application/json";
				if (req.path.indexOf("..") < 0) {
					if (req.path.indexOf(".html") > 0) log("File: " + req.path);
					(async () => {
						try {
							reply = await fs.readFile(clientRoot + req.path);
							replyType = contentType;
						} catch (err) {
							req.err = err;
							reply = util.inspect(req);
						} finally {
							response.writeHead(200, { "Content-Type": replyType });
							response.end(reply);
						}
					})()
				}
			}
		} catch (err) {
			log("Serve exception " + util.inspect(err));
		}
	}

	const server = http.createServer(serve);
	const port = process.argv[2] || 80;
	server.listen(port);
	log(`Server running at http://localhost:${port}`);
})()

function operationRequest(params) {
	let suffix = "";
	switch (params.action) {
		case "mute":
			suffix = "?command=volume&val=0";
			break;
		case "unmute":
			suffix = "?command=volume&val=190";
			break;
		case "next":
			suffix = "?command=pl_next";
			break;
		case "pause":
			suffix = "?command=pl_pause";
			break;
		case "stop":
			suffix = "?command=pl_stop";
			break;
		case "play":
			suffix = "?command=pl_play";
			break;
		default:
			suffix = "";
	}
	let url = "http://127.0.0.1:8080/requests/status.json" + suffix;
	let headers = {
		"Authorization": credentials,
		"Content-Type": "application/json"
	};
	let http = {
		max_redirects: 0,
		request_fullurl: 1,
		ignore_errors: true,
		method: "get",
		headers: headers
	}
	return { url, http };
}

var detectorEnabled = true;

async function toggleDetector(params) {
	detectorEnabled = !detectorEnabled;
}

async function operation(params) {
	let { url, http } = operationRequest(params);
	let response = {};
	let gotResponse = false;
	try {
		let jsonData = await fetch(url, http).then(r => r.json());
		report =
		{
			title: jsonData?.information?.category?.meta?.now_playing,
			file: jsonData?.information?.category?.meta?.filename,
			artwork: jsonData?.information?.category?.meta?.artwork_url,
			position: jsonData?.position,
			time: jsonData?.time,
			length: jsonData?.length,
			volume: jsonData?.volume,
			state: jsonData?.state,
			detector: detectorEnabled
		};
		response = {
			body: JSON.stringify(report), status: 200, contentType: "application/json"
		};
	} catch (err) {
		let errReport = util.inspect(err);
		if (errReport.indexOf("fetch failed") >= 0) errReport = errReport.match(/cause:(.*)\n/)?.[1] || errReport;
		verbose(`${params.action || params.amount} operation: ${url} \n ${util.inspect(http)}\nError: ${util.inspect(err)}`);
		response = { body: JSON.stringify({ fetchFail: errReport }), status: 400, contentType: "application/json" };
	}
	return response;
}

function unmuteFromSensor() {
	if ((report?.volume||100)<10 && detectorEnabled) {
		operation({action:"unmute"});
		setTimeout(()=> {
			if (detectorEnabled)
				operation({action: "mute"});
		},600000);
	}
}

async function sleepForSeconds(seconds) {
	return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function listSlides(params) {
	let imgdir = await fs.readdir("/media/alan/", { withFileTypes: true });
	let slidesDir = "";
	for (let item of imgdir) {
		if (item.isDirectory) {
				slidesDir = item.name;
				break;
		}
	}
	let dir = await fs.readdir(`/media/alan/${slidesDir}`);
	return { body: JSON.stringify(dir.filter(fn=> fn.indexOf('.')>0)), contentType: "application/json", status: 200 };
}

async function getUrl(params) {
	let url = "https://" + params["u"];
	try {
		let response = await fetch(url, params["o"]);
		replyType = response.headers.get("content-type");
		let reply = await response.text();
		return {
			status: response.status,
			contentType: response.headers.get("content-type"),
			body: reply
		}
	} catch (err) {
		return { status: 500, contentType: "text/plain", body: util.inspect(err) };
	}
}

function parseReq(request, defaultPage = "/index.html") {
	let url = request.url;
	let method = request.method;
	let headers = {};
	for (let i = 0; i < request.rawHeaders.length; i += 2) {
		headers[request.rawHeaders[i]] = request.rawHeaders[i + 1];
	}
	let host = headers.Host;
	let path = url.replace(/[\?#].*/, "");
	if (path == "/") path = defaultPage;
	let extension = path.match(/\.[^.]*$/)?.[0] ?? "";
	let query = url.match(/\?(.*)/)?.[1] ?? "";  // url.replace(/.*\?/,"");
	let paramStrings = query.split('&');
	let params = paramStrings.reduce((m, keqv) => {
		if (!keqv) return m;
		let kv = keqv.split('=');
		m[kv[0]] = kv.length > 1 ? kv[1] : true;
		return m;
	}, {});
	return { path: path, extension: extension, query: query, params: params, host: host, url: url, method: method, headers: headers };
}

// ******************************************
// LIGHT SENSOR
// https://github.com/fivdi/pigpio/blob/master/README.md
// Room illumination 10..100lux --> LDR 10k..2k
// Connect GPIO17 -- 0.5k -- (LDR || 1uF) -- 0V

const Gpio = require('pigpio').Gpio;
const lightSensor = new Gpio(17, {
	mode:Gpio.INPUT, 
	pullUpDown:Gpio.PUD_OFF, 
	alert:true
});
//lightSensor.glitchFilter(1000);

let startTime = 0;
let interval = 0;
let previousInterval = 0;
let onTick = 0;
let offTick = 0;

/*
lightSensor.on('alert', (level, tick) => {
	if (level==1) {
		startTime = tick;
		interval = 1000000;
		log ("on");
	} else {
		interval = (tick>>0) - (startTime>>0);
		// Dark 1000k -> 1s, mid 10k -> 10ms, light 1k -> 1ms
		log(interval);
	}
});

setInterval(()=> {
	if (previousInterval != 0 && Math.abs(interval-previousInterval) > 10) {
		unmuteFromSensor();
	}
	previousInterval = interval;
	lightSensor.mode(Gpio.OUTPUT);
	lightSensor.digitalWrite(1);
	setTimeout(()=>{
		lightSensor.mode(Gpio.INPUT);
		lightSensor.pullUpDown(Gpio.PUD_OFF);
	}, 10); // 1uF x 1k = 1ms
},1000);
*/
let r = 0;
lightSensor.on('alert', (level, tick) => {
	if (level == 1) {
		r = (tick>>0)-(onTick>>0);
	} else {
		log(`${r} ${(tick>>0)-(offTick>>0)}`);
	}
});

const led = new Gpio(27, {mode:Gpio.OUTPUT, alert:true});
led.on('alert', (level, tick) =>{
	if (level == 1) {
		onTick = tick;
	} else {
		offTick = tick;
		//log (`led ${(offTick>>0)-(onTick>>0)}`);
	}
});
let ledState = false;
setInterval(() => {
	ledState = !ledState;
	led.digitalWrite(ledState ? 1 : 0);
}, 1000);



// ******************************************
// LOG

function verbose(msg) {
	if (logverbose) log(msg);
}
let previousMsg = "";
let messageRepeatCount = 0;
function log(msg, condition = true) {
	if (condition && previousMsg != msg) {
		if (messageRepeatCount > 0) {
			console.log(` * ${messageRepeatCount}`);
			messageRepeatCount = 0;
		}
		previousMsg = msg;
		console.log(`${new Date().toISOString()} ${msg}`);
	} else {
		messageRepeatCount++;
	}
}


