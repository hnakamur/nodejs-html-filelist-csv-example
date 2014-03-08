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
    recursive_readdir = require('recursive-readdir'),
    csv = require('csv'),
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

if (baseDir.substr(-1) === '/' && baseDir !== '/') {
  baseDir = baseDir.substr(0, baseDir.length - 1);
}
Q.nfcall(recursive_readdir, baseDir)
.then(function(files) {
  var htmlFiles = _.filter(files, function(file) {
        return htmlFileExpr.test(file);
      }),
      promises = _.map(htmlFiles, function(file) {
        return readHtml(file);
      });

  return Q.all(promises);
})
.then(writeCSV)
.done();
