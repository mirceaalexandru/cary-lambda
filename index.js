'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3();
const EJS = require('ejs');
const nodemailer = require('nodemailer');
const smtpTransport = require("nodemailer-smtp-transport");

exports.handler = (event, context, done) => {
	const configParams = {Bucket: 'crontor', Key: 'config/app-config.json'};
	S3.getObject(configParams, function(err, config) {
		if (err) {
			console.log('Error occurred while reading config: ', err, err.stack);
			return done(err);
		}

		config = JSON.parse(config.Body.toString());

		const message = JSON.parse(event.Records[0].Sns.Message);
		console.log('From SNS:', message);
		reportStatus(config, message, 'progress', 0);

		switch (message.job) {
			case 'email':
				sendEmail(config, message, done);
				break;
			case 'dummy-ok':
				dummyServiceOK(config, message, done);
				break;
		}
	});
};

// will report changes in progress at fixed time intervals and then complete successful
function dummyServiceOK(config, message, done) {
	console.log(`Executing dummy service ${message.jobId}`);

	let status = 0;
	notify();

	function notify () {
		if (status > 90) {
			reportStatus(config, message, 'completed', 0, () => {
				done();
			});
		} else {
			reportStatus(config, message, 'progress', status);
			status += 10;

			setTimeout(notify, 100);
		}
	}
}

function sendEmail(config, message, done){
	let input = message.data;
	console.log(`Send email: ${JSON.stringify(input, null, 2)}`);

	let templateParams = {Bucket: 'crontor', Key: `email-templates/${input.template}.html`};
	S3.getObject(templateParams, function(err, templateContent) {
		if (err) {
			console.log(`Error occurred while reading email template ${templateParams}: `, err, err.stack);
			reportStatus(config, message, 'error');
			return done(err);
		}
		templateContent = templateContent.Body.toString();
		try {
			input.html = EJS.render(templateContent, input.data);
		}catch (err) {
			console.log(`Send email error: ${err}, data is ${JSON.stringify(input.data, null, 2)}`);
			reportStatus(config, message, 'error');
			return done(err);
		}

		let transporter = nodemailer.createTransport(smtpTransport(config.email));
		transporter.sendMail(input, function (err){
			if (err) {
				reportStatus(config, message, 'error');
				console.log(`Send email error: ${err}`);
				return done(err);
			}

			reportStatus(config, message, 'completed');
			done(err);
		});
	});
}

function reportStatus(config, message, status, progress, done){
	console.log(`Notify job ${message.job} - ${message.jobId} new status ${status}, progress ${progress || 'N/A'}`);

	let statusTopic = config.aws.sns.jobStatus;
	publish(
		statusTopic, {
			job: message.job,
			jobId: message.jobId,
			status: status || 0,
			progress: progress
		},
		(err) => {
			if (err) {
				console.log('Error occurred while sending job status: ', err, err.stack);
			}

			return done && done(err);
		});
}

function publish(topic, message, done) {
	let sns = new AWS.SNS();

	let data = {
		TopicArn: topic,
		Message: JSON.stringify(message)
	};

	sns.publish(data, function (err, result) {
		if (err) {
			console.log(`Cannot send message to SNS ${err}`);
		}

		done(err, result);
	});
}


