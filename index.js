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

		let input = message.data;
		console.log(`Send email: ${JSON.stringify(input, null, 2)}`)

		let templateParams = {Bucket: 'crontor', Key: `email-templates/${input.template}.html`};
		S3.getObject(templateParams, function(err, templateContent) {
			if (err) {
				console.log(`Error occurred while reading email template ${templateParams}: `, err, err.stack);
				return done(err);
			}
			templateContent = templateContent.Body.toString();
			try {
				input.html = EJS.render(templateContent, input.data);
			}catch (err) {
				console.log(`Send email error: ${err}, data is ${JSON.stringify(input.data, null, 2)}`);
				return done(err);
			}

			let transporter = nodemailer.createTransport(smtpTransport(config.email));
			transporter.sendMail(input, function (err){
				if (err) {
					console.log(`Send email error: ${err}`)
				}
				done(err);
			});
		});
	})
};
