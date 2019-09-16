const request = require('request');
const XLSX = require('xlsx');
const requestretry = require('requestretry');
const cheerio = require('cheerio');
const fs = require('fs');
const UrlSafeString = require('url-safe-string');

var folders = [];

// scrape doitinhebrew for all words in a XLSX file
function scrapeFile(path) {
	// open file, get words
	var workbook = XLSX.readFile(path);
	var worksheet = workbook.Sheets[workbook.SheetNames[0]];
	var words = XLSX.utils.sheet_to_json(worksheet, { header : 1 });

	// loop through words
	words.forEach(function(word) {
		
		// request word page from doitinhebrew
		//console.log(word[0]);

		// scrape content
		var url = `https://www.doitinhebrew.com/Translate/Default.aspx?txt=${encodeURI(word[0])}&kb=US%20US&l1=en&l2=iw&s=1`;
		//console.log(url);
		var opts = {
			url: url,

			// The below parameters are specific to request-retry
			maxAttempts: 30,   // (default) try 5 times
			retryDelay: 5000,  // (default) wait for 5s before trying again
			retryStrategy: requestretry.RetryStrategies.HTTPOrNetworkError // (default) retry on 5xx or network errors
		};
		requestretry(opts, function(error, response, body) {
			if(error !== null) {
				console.error(error);
				//errorReport.push({ type: 'CATERROR', error: catError, url: opts.url });
			}
			else if(response.statusCode !== 200) {
				console.error('Request failed. Status code ' + response.statusCode + ' received.');
				//errorReport.push({ type: 'CATERROR_CODE', code: response.statusCode, url: opts.url });
			}
			else {
				var $ = cheerio.load(body);
				console.log($(".hebblock").text());
			}
		});
	});
}

// scrapes all directories in a directory
function scrapeFolders(paths) {
	// get last folder in array
	var currentFolder = paths[paths.length - 1];

	// loop through all files in that folder
	console.log('CATEGORY: ' + currentFolder.categoryFolder);
	currentFolder.subcategoryFiles.forEach(function(subcat, index) {
		console.log('subcategory: ' + subcat);
		// loop through words
		scrapeFile(`./output/${currentFolder.categoryFolder}/${subcat}`);

		// scrape next category when finished with this one
		if(index == (currentFolder.subcategoryFiles.length -1)) {
			paths.pop();
			if(paths.length > 0) {
				scrapeFolders(paths);
			}
		}
	});
}

fs.readdir('./output', function(err, outputContents) {
	if(!err) {
		outputContents.forEach(function(categoryFolder) {
			fs.readdir('./output/' + categoryFolder, function(error, subcategoryFiles) {
				folders.push({ categoryFolder : categoryFolder, subcategoryFiles : subcategoryFiles });
				if(folders.length == outputContents.length) {
					scrapeFolders(folders);
					//scrapeFile('./output/art/art-through-the-ages-in-hebrew.xlsx')
				}
			});
		});
	}
	else {
		console.error(err.message);
	}
});