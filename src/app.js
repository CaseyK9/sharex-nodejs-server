const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const Busboy = require('busboy');
const app = express(); // Initialize the express web server
const logger = require('./logger.js');
const uniqueFilename = require('unique-filename')

const listenPort = process.env.PORT | 80;
const workDir = "data";
const serveDir = "public";
const tmpDir = "tmp";
const fileDir = "f";
const imgDir = "i";
const key = process.env.KEY | "key";

const extImg = ["png", "jpg", "jpeg", "bmp"];


fs.ensureDir(workDir);
fs.ensureDir(path.join(workDir, tmpDir));
fs.ensureDir(path.join(workDir, serveDir, fileDir));
fs.ensureDir(path.join(workDir, serveDir, imgDir));
const reqData = {
    fileName: null,
    key: null,
    tmpFilePath: null,
}

const resData = {
    code: 400,
    success: false,
    file: null,
    error: null,
}


app.get('/', function (req, res) {
    res.send('Listing not allowed');
});

app.use('/' + fileDir, express.static(path.join(workDir, serveDir, fileDir)));
app.use('/' + imgDir, express.static(path.join(workDir, serveDir, imgDir)));

app.route('/upload').post((req, res) => {
    var busboy = new Busboy({ headers: req.headers });
    busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
        reqData.fileName = filename;
        reqData.tmpFilePath = uniqueFilename(path.join(workDir, tmpDir));
        logger.info(`File received, name: ${filename}, tmpFilePath: ${reqData.tmpFilePath}`);
        file.pipe(fs.createWriteStream(reqData.tmpFilePath));
    });
    busboy.on('field', function (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
        if (fieldname == "key" && val == key) {
            reqData.key = val;
            logger.info(`Key sent: ${val} matches!`);
        }

    });

    busboy.on('finish', function () {
        logger.info(`Request proccessed`)
        res.setHeader('Content-Type', 'application/json');


        if (reqData.fileName && reqData.key) {
            logger.info("Got file and key, setting response code:200 and success:true");
            resData.code = 200;
            resData.success = true;
        }

        let subDir;
        if (extImg.indexOf(path.extname(reqData.fileName).replace(".", "")) > -1) {
            logger.info(`Considering file: ${reqData.fileName} -> image`);
            subDir = imgDir;
        } else {
            logger.info(`Considering file: ${reqData.fileName} -> file`);
            subDir = fileDir;
        }

        let newFileName = reqData.fileName.replace(" ", "_");
        logger.info(`New filename is : ${newFileName}`);
        let newFilePath = path.join(workDir, serveDir, subDir, newFileName);
        let newFileUrl = path.join(subDir, newFileName);
        logger.info(`Moving ${reqData.tmpFilePath} to ${newFilePath}`);

        if (fs.existsSync(newFilePath)) {
            logger.info(`File: ${newFilePath} exists, deleting it`);
            fs.unlinkSync(newFilePath);
        }

        let connectionPrefix;
        req.secure ? connectionPrefix = "https://" : connectionPrefix = "http://";

        fs.moveSync(reqData.tmpFilePath, newFilePath);
        resData.file = {
            url: connectionPrefix + req.get('host') + "/" + newFileUrl,
            delete_url: connectionPrefix + req.get('host') + '/delete?filename=' + newFileName + '&key=' + key + "&subdir=" + subDir
        }
        res.status(resData.code).send(JSON.stringify({
            success: resData.success,
            ...(resData.file && { file: resData.file }),
            ...(resData.error && { erro: resData.error }),
        }));
    });
    return req.pipe(busboy);
});

app.get('/delete', function (req, res) {
    if (!req.query.filename || !req.query.key || !req.query.subdir) {
        res.setHeader('Content-Type', 'application/json');
        res.status(400).send(JSON.stringify({
            success: false,
            error: {
                message: 'Key/urlprefix and/or file name is empty.',
                fix: 'Submit a key and/or file name.'
            }
        }));
        logger.error(`Key/urlprefix and/or file name is empty.`)
        return;
    }
    logger.info(`Received delete request, filename: ${req.query.filename}, key: ${req.query.key}, subdir: ${req.query.subdir}`)

    if (req.query.key != key) {
        logger.auth('Failed authentication with key ' + key);
        res.setHeader('Content-Type', 'application/json');
        res.status(401).send(JSON.stringify({
            success: false,
            error: {
                message: 'Key is invalid.',
                fix: 'Submit a valid key.'
            }
        }));
        return;
    }
    const fileToDelete = path.join(workDir,serveDir,req.query.subdir,req.query.filename);
    if (!fs.existsSync(fileToDelete)) {
        logger.error(`Cant find file, subdir : ${req.query.subdir}, filename: ${req.query.filename}`);
        res.setHeader('Content-Type', 'application/json');
        res.status(400).send(JSON.stringify({
            success: false,
            error: {
                message: 'Cant find to delete',
                fix: 'None'
            }
        }));
        return;
    }
    logger.info(`Deleting file ${fileToDelete}`);
    fs.unlinkSync(fileToDelete);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({
        success: true,
        message: "Deleted file " + req.query.filename
    }));
});



const server = app.listen(listenPort, function () {
    console.log(`Listening on port ${server.address().port}`);
});