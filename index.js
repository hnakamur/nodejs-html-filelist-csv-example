var baseDir = process.argv[2],
    baseURL = process.argv[3],
    outFile = process.argv[4],
    _ = require('underscore'),
    fs = require('fs'),
    path = require('path'),
    Q = require('q'),
    jschardet = require('jschardet'),
    Iconv = require('iconv').Iconv,
    cheerio = require('cheerio'),
    csv = require('csv'),
    scandir = require('scandir').create(),
    officegen = require('officegen'),
    htmlFileExpr = /\.html?$/i;

if (!baseDir) {
  throw new Error('A directory of site contents must be specified!');
}
if (!fs.existsSync(baseDir)) {
  throw new Error('A directory specified does not exist!');
}
if (!baseURL) {
  throw new Error('A base URL must be specified!');
}
if (!outFile) {
  throw new Error('A output file must be specified!');
}

function recursiveReadDir(baseDir, filter, callback) {
  var files = [];

  if (callback === undefined) {
    callback = filter;
    filter = undefined;
  }

  scandir.on('file', function(file, stats) {
    files.push(file);
  });

  scandir.on('error', function(err) {
    callback(err, null);
  });

  scandir.on('end', function() {
    callback(null, files);
  });

  scandir.scan({
    dir: baseDir,
    filter: filter
  });
}

function readHtml(filename) {
  return Q.nfcall(fs.readFile, filename)
  .then(function(text) {
    var encoding = jschardet.detect(text).encoding,
        iconv,
        $,
        getText,
        getMetaContent,
        directory,
        title,
        keywords,
        description;

    if (encoding !== 'ascii' && encoding !== 'utf-8') {
      iconv = new Iconv(encoding, 'UTF-8//TRANSLIT//IGNORE');
      text = iconv.convert(text);
    }

    $ = cheerio.load(text);
    getText = function(selector) {
      var el = $(selector);
      return el ? el.text() : '';
    };
    getMetaContent = function(name) {
      var el = $('meta[name=' + name + ']');
          content = el ? el.attr('content') : '';
      return content ? content : '';
    };

    filename = filename.substr(baseDir.length);
    directory = path.dirname(filename);
    title = getText('title');
    keywords = getMetaContent('keywords');
    description = getMetaContent('description');
    return {
      directory: directory,
      title: title,
      keywords: keywords,
      description: description,
      URL: baseURL + filename
    };
  });
}

function writeCSV(results) {
  return Q.fcall(function() {
    var columns = [
          'directory',
          'title',
          'keywords',
          'description',
          'URL'
        ],
        rows = results.map(function(result) {
          return [
            result.directory,
            result.title,
            result.keywords,
            result.description,
            result.URL
          ];
        }),
        iconv = new Iconv('UTF-8', 'Shift_JIS//TRANSLIT//IGNORE');

    iconv.pipe(fs.createWriteStream(outFile));
    csv().from([columns].concat(rows), { columns: true })
    .to(iconv, { header: true });
  });
}

function writeExcel(results) {
  return Q.fcall(function() {
    var xlsx, columns, rows, sheet, row, i, j, colCount, rowCount, out;
    xlsx = officegen('xlsx');
    columns = [
      'directory',
      'title',
      'keywords',
      'description',
      'URL'
    ];
    rows = results.map(function(result) {
      return [
        result.directory,
        result.title,
        result.keywords,
        result.description,
        result.URL
      ];
    });
    colCount = columns.length;
    rowCount = rows.length;

    xlsx.on('error', function(err) {
      throw err;
    });
    sheet = xlsx.makeNewSheet();
    sheet.name = 'HTML files';

    sheet.data[0] = [];
    for (j = 0; j < colCount; j++) {
      sheet.data[0][j] = columns[j];
    }

    for (i = 0; i < rowCount; i++) {
      row = rows[i];
      sheet.data[i + 1] = [];
      for (j = 0; j < colCount; j++) {
        sheet.data[i + 1][j] = row[j];
      }
    }

    out = fs.createWriteStream(outFile);
    out.on('error', function(err) {
      throw err;
    });
    xlsx.generate(out);
  });
}

if (baseDir.substr(-1) === '/' && baseDir !== '/') {
  baseDir = baseDir.substr(0, baseDir.length - 1);
}
Q.nfcall(recursiveReadDir, baseDir, /\.html?/i)
.then(function(htmlFiles) {
  var promises;

  promises = _.map(htmlFiles, function(file) {
    return readHtml(file);
  });

  return Q.all(promises);
})
.then(function(results) {
  if (outFile.substr(-5) === '.xlsx') {
    return writeExcel(results);
  } else {
    return writeCSV(results);
  }
})
.done();
