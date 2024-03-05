const http = require('http');
const util = require('util');
const fs = require('fs/promises');
const { argv } = require('process');

const logverbose = false;

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

(async () => {
	let root = await fs.realpath('.');
	root = root.replace("/server", "");
	donationLog = `${root}/log-donations.log`;
	const clientRoot = `${root}/client`;
	const credentials = null; //await getCredentials(root, argv?.[3]);

	const handlers = {
		"get-url": getUrl,
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
								let reply = await handlers[k](req.params, credentials, clientRoot);
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
		"Authorization": "Basic OnZsYw==",
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

async function operation(params, credentials) {
	let { url, http } = operationRequest(params, credentials);
	let response = {};
	let gotResponse = false;
	try {
		let jsonData = await fetch(url, http).then(r => r.json());
		let report =
		{
			title: jsonData?.information?.meta?.now_playing,
			file: jsonData?.information?.meta?.filename,
			artwork: jsonData?.information?.meta?.artwork_url,
			position: jsonData?.position,
			time: jsonData?.time,
			length: jsonData?.length,
			volume: jsonData?.volume,
			state: jsonData?.state
		};
		response = {
			body: JSON.stringify(
				{ Content: jsonData, Response: report }
			), status: reply.status, contentType: contentType
		};
	} catch (err) {
		let errReport = util.inspect(err);
		if (errReport.indexOf("fetch failed") >= 0) errReport = errReport.match(/cause:(.*)\n/)?.[1] || errReport;
		retryLog += `    ${params.action || params.amount} ${errReport} \n`;
		verbose(`${params.action || params.amount} Card operation: ${url} \n ${util.inspect(http)}\nError: ${util.inspect(err)}`);
		response = { body: JSON.stringify({ fetchFail: errReport }), status: 400, contentType: "application/json" };
	}
	log(retryLog);
	return response;
}

async function sleepForSeconds(seconds) {
	return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function listSlides(params, credentials, clientRoot) {
	let imgdir = await fs.readdir("/media/alan/", { withFileTypes: true });
	let slidesDir = "";
	for (let item of imgdir) {
		if (item.isDirectory) {
				slidesDir = item.name;
				break;
		}
	}
	let dir = await fs.readdir(`/media/alan/${slidesDir}`);
	return { body: JSON.stringify(dir), contentType: "application/json", status: 200 };
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


