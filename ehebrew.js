const request = require('request');
const XLSX = require('xlsx');
const requestretry = require('requestretry');
const cheerio = require('cheerio');
const fs = require('fs');
const UrlSafeString = require('url-safe-string');

const fileNameOpts = {
	lowercaseOnly:      true,
	regexRemovePattern: /((?!([a-z0-9])).)/gi,
	joinString:         '-',
	trimWhitespace:     true
}

const fileNameGenerator  = new UrlSafeString(fileNameOpts);

var errorReport = [];

request('https://web.archive.org/web/20180831202558if_/http://www.ehebrew.org', function(error, response, body) {

	if(error !== null) {
		console.error(error);
	}
	else if(response.statusCode !== 200) {
		console.error('Request failed. Status code ' + response.statusCode + ' received.');
	}
	else {
		var catLinks = [];
		let $ = cheerio.load(body);
		$('div[style*="float: left; width: 33%; font-family: Verdana, Arial, Helvetica, sans-serif; font-size: 14px;"] > a').each(function() {
			catLinks.push($(this).attr('href'));
		});
		console.log(catLinks);

		catLinks.forEach(function(catLink) {
			// create folder for current category
			
			var opts = {
				url: 'https://web.archive.org/web/20180831202558if_/' + catLink,
 
				// The below parameters are specific to request-retry
				maxAttempts: 30,   // (default) try 5 times
				retryDelay: 5000,  // (default) wait for 5s before trying again
				retryStrategy: requestretry.RetryStrategies.HTTPOrNetworkError // (default) retry on 5xx or network errors
			};
			requestretry(opts, function(catError, catResponse, catBody) {
				if(catError !== null) {
					console.log('CATEGORY ERROR:');
					console.error(catError);
					errorReport.push({ type: 'CATERROR', error: catError, url: opts.url });
				}
				else if(catResponse.statusCode !== 200) {
					console.error('Request failed. Status code ' + catResponse.statusCode + ' received.');
					errorReport.push({ type: 'CATERROR_CODE', code: catResponse.statusCode, url: opts.url });
				}
				else {
					var subcatLinks = [];
					let $ = cheerio.load(catBody);
					var category = $('h1').text().trim();
					category = category.replace(' in Hebrew', '');
					console.log('***** CATEGORY: ' + category);
					$('h2 a').each(function() {
						subcatLinks.push($(this).attr('href'));
					});

					subcatLinks.forEach(function(subcatLink, index) {
						var hebWords = [];
						var engWords = [];
						let opts = {
							url: 'https://web.archive.org/web/20180831204454if_/' + subcatLink,
 
							// The below parameters are specific to request-retry
							maxAttempts: 150,   // (default) try 5 times
							retryDelay: 20000,  // (default) wait for 5s before trying again
							retryStrategy: requestretry.RetryStrategies.HTTPOrNetworkError // (default) retry on 5xx or network errors
						};
						requestretry(opts, function(subcatError, subcatResponse, subcatBody) {
							if(subcatError !== null) {
								console.log('SUBCATEGORY ERROR:');
								console.error(subcatError);
								errorReport.push({ type: 'SUBCATERROR', error: subcatError, url: opts.url });
							}
							else if(subcatResponse.statusCode !== 200) {
								console.error('Request failed. Status code ' + subcatResponse.statusCode + ' received.');
								errorReport.push({ type: 'SUBCATERROR_CODE', code: subcatResponse.statusCode, url: opts.url });
							}
							else {
								let wordLinks = [];
								let $ = cheerio.load(subcatBody);
								try {
									var subcategory = $('h1').text();
									subcategory = subcategory.replace(category + ' - ','');
									$('h2 a').each(function() {
										wordLinks.push($(this).attr('href'));
									});
									wordLinks.forEach(function(wordLink) {
										let opts = {
											url: 'https://web.archive.org/web/20170216090126if_/' + wordLink,
 
											// The below parameters are specific to request-retry
											maxAttempts: 200,   // (default) try 5 times
											retryDelay: 30000,  // (default) wait for 5s before trying again
											retryStrategy: requestretry.RetryStrategies.HTTPOrNetworkError // (default) retry on 5xx or network errors
										};

										requestretry(opts, function(wordError, wordResponse, wordBody){
											// this callback will only be called when the request succeeded or after maxAttempts or on error
											if(wordError !== null) {
												console.log('WORD ERROR:');
												console.error(wordError);
												errorReport.push({ type: 'WORDERROR', error: wordError, url: opts.url });
											}
											else if(wordResponse.statusCode !== 200) {
												console.error('Request failed. Status code ' + wordResponse.statusCode + ' received.');
												errorReport.push({ type: 'WORDERROR_CODE', code: wordResponse.statusCode, url: opts.url });
											}
											else {
												let $ = cheerio.load(wordBody);
												console.log($('font[style="font-size: 30px; direction: rtl;"]').first().text().trim());

												var hebrewWordArray = [];
												$('font[style="font-size: 30px; direction: rtl;"]').each(function() {
													hebrewWordArray.push($(this).text().trim());
												});
												var hebrewWord = hebrewWordArray.join('\\');

												hebWords.push([$('font[style="font-size: 30px;"]').text().trim(), hebrewWord]);
												//engWords.push([$('font[style="font-size: 30px;"]'.text().trim()]);

												if(hebWords.length === wordLinks.length) {
													var wb = XLSX.utils.book_new();
													var ws = XLSX.utils.aoa_to_sheet(hebWords);
													XLSX.utils.book_append_sheet(wb, ws, 'words');
													var fileName = fileNameGenerator.generate(subcategory);
													var folderName = fileNameGenerator.generate(category);
													console.log("\nFOLDERNAME:       " + folderName + "\n");

													fs.access('./output/' + folderName, fs.constants.F_OK, (accessError) => {
														if(!accessError) {
															XLSX.writeFile(wb, './output/' + folderName + '/' + fileName + '.xlsx');
															console.log('\n\n\n\n\n\nWrote subcat file.\n\n\n\n\n\n');
														}
														else {
															fs.mkdir('./output/' + folderName, function(folderError) {
																if (folderError) {
																	throw folderError;
																}
																XLSX.writeFile(wb, './output/' + folderName + '/' + fileName + '.xlsx');
																console.log('\n\n\n\n\n\nWrote subcat file.\n\n\n\n\n\n');
															});
														}
													});
												}
											}
										});
									});
								}
								catch(e) {
									console.error(e.message);
								}
							}
						});
					});
				}
			});
		});
	}
});