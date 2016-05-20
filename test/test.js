/*
 Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
 For licensing, see LICENSE.md
 */

const ckbuilder = require( '../src/ckbuilder' );
ckbuilder.options.debug = 2;

const fs = require( 'fs-extra' );
const path = require( 'path' );
const md5 = require( 'js-md5' );
const Canvas = require( "canvas" );
const Image = Canvas.Image;

// Run tests.
var passCount = 0;
var failCount = 0;
var assetsPath = './test/_assets';
var assetsDir = path.resolve( assetsPath );
var tempPath = './test/tmp';
var tempDir = path.resolve( tempPath );
var timestampStub = 'G3KH';

function isArray(o) {
	return Object.prototype.toString.call(o) === '[object Array]';
}

function assertDirectoriesAreEqual( expected, actual, title )
{
	var dirList = fs.readdirSync( expected );
	var actualFile;
	var expectedFile;

	for ( var i = 0 ; i < dirList.length ; i++ )
	{
		actualFile = path.resolve( actual, dirList[i] );
		expectedFile = path.resolve( expected, dirList[i] );
		assertEquals( true, ckbuilder.io.exists( actualFile ), '[' + title + '] file should exist: ' + actualFile );
		assertEquals( fs.statSync( expectedFile ).isDirectory(), fs.statSync( actualFile ).isDirectory(), '[' + title + '] files should be of the same type: ' + actualFile );
		if ( ckbuilder.io.exists( actualFile ) )
		{
			if ( fs.statSync( actualFile ).isDirectory() )
				assertDirectoriesAreEqual( expectedFile, actualFile, title );
			else
				assertFilesAreEqual( expectedFile, actualFile, title );
		}
	}

	dirList = fs.readdirSync( actual );

	// Check for files that should not exists
	for ( var i = 0 ; i < dirList.length ; i++ )
	{
		actualFile = path.resolve( actual, dirList[i] );
		expectedFile = path.resolve( expected, dirList[i] );
		if ( !ckbuilder.io.exists( expectedFile ) )
			assertEquals( false, ckbuilder.io.exists( actualFile ), '[' + title + '] file should not exist: ' + actualFile );
	}
}

function assertFilesAreEqual( expected, actual, title )
{
	assertEquals( String( md5( ckbuilder.io.readFile( expected ) ) ), String( md5( ckbuilder.io.readFile( actual ) ) ),
		'[' + title + '] Checking MD5 of ' + actual);
}

function assertEquals( expected, actual, title )
{
	if ( ( !isArray( expected ) && expected !== actual) || JSON.stringify( expected ) !== JSON.stringify( actual ) )
	{
		var error = {
			expected : expected,
			actual : actual
		};

		console.error( new Error( 'FAILED: ' + (title ? title : "") ) );

//			if ( !error.expected )
//				throw error;

		console.error( new Error( '  Expected: ' + error.expected ) );
		console.error( new Error( '  Actual  : ' + error.actual ) );

		failCount++;
	}
	else
		passCount++;
}

function error( msg )
{
	console.error( new Error( msg ) );
	process.exit( 1 );
}

function prepareTempDirs()
{
	if ( ckbuilder.io.exists( tempDir ) )
	{
		try
		{
			ckbuilder.io.deleteDirectory( tempDir );
		} catch ( e )
		{
			error( "Can't delete temp directory" );
		}
	}

	try
	{
		fs.mkdirSync( tempDir );
	} catch ( e )
	{
		error( "Can't create temp directory: " + tempDir );
	}

	var assetsDirList = fs.readdirSync( assetsDir );
	for ( var i = 0; i < assetsDirList.length; i++ )
	{
		var f = path.resolve( tempDir, assetsDirList[i] );
		try
		{
			fs.mkdirSync( f );
		} catch ( e )
		{
			error( "Can't create temp directory: " + f );
		}
	}
}

function testLanguageFiles()
{
	console.log( "\nTesting processing language files\n" );
	var dir = path.resolve( assetsDir, 'langfiles' );
	var dirList = fs.readdirSync( dir );
	var pluginNames = { devtools : 1, placeholder : 1, uicolor : 1 };
	var languages = { en : 1, he : 1, pl : 1 };

	ckbuilder.lang.mergeAll( path.resolve( assetsDir, 'langfiles' ), path.resolve( tempDir, 'langfiles' ), pluginNames, languages );

	for ( var i = 0; i < dirList.length; i++ )
	{
		if ( dirList[i].indexOf( ".correct" ) === -1 )
			continue;

		var correctFile = path.resolve( dir, dirList[i] );
		var testName = path.basename( correctFile ).replace( ".correct", "" );
		var tempFile = path.resolve( tempDir + '/langfiles/' + testName );

		assertEquals( ckbuilder.io.readFile( correctFile ), ckbuilder.io.readFile( tempFile ), 'Language file: ' + testName );
	}
	var french = path.resolve( tempDir + '/langfiles/fr.js' );
	assertEquals( ckbuilder.io.exists( french ), false );
}

function testCssProcessor( testFolder, leaveCssUnminified )
{
	console.log( "\nTesting CSS processor\n" );
	var correctFile, dir, dirList, test, tempFile;

	ckbuilder.options.leaveCssUnminified = leaveCssUnminified;
	ckbuilder.io.copy( path.resolve( assetsDir + testFolder ), path.resolve( tempDir + testFolder ) );
	ckbuilder.css.mergeCssFiles( path.resolve( tempDir + testFolder ) );

	var sourceDir = path.resolve( assetsDir + testFolder );
	var sourceDirList = fs.readdirSync( sourceDir );

	for ( var i = 0 ; i < sourceDirList.length ; i++ )
	{
		if ( String( sourceDirList[i] ) === ".svn" || String( sourceDirList[i] ) === ".git" )
			continue;

		dir = path.resolve( tempDir + testFolder, sourceDirList[i] );
		assertEquals( true, ckbuilder.io.exists( dir ), dir + " exists?" );

		dirList = fs.readdirSync( dir );
		assertEquals( true, dirList.length > 0, dir + " not empty?" );

		var foundCorrect = 0;
		var foundCss = 0;
		/**
		 * Loop through files in the target directory and search for valid
		 * CSS files
		 */
		for ( var j = 0 ; j < dirList.length ; j++ )
		{
			if ( dirList[j].indexOf( ".css" ) !== -1 )
				foundCss++;

			if ( dirList[j].indexOf( "correct.txt" ) !== -1 )
			{
				foundCorrect++;
				test = dirList[j].replace( ".correct.txt", "" );

				correctFile = path.resolve( dir, dirList[j] );
				tempFile = path.resolve( dir, test + '.css' );

				assertEquals( true, ckbuilder.io.exists( tempFile ), tempFile + " exists?" );

				assertEquals( String( md5( ckbuilder.io.readFile( correctFile ) ) ), String( md5( ckbuilder.io.readFile( tempFile ) ) ),
					'Checking md5 of created file [' + path.basename( dir ) + "/" + test + '.css]' );
			}
		}
		if ( foundCorrect )
			assertEquals( foundCorrect, foundCss, 'The number of created and correct css files must be equal in skin ' + path.basename( dir ) );
	}
}

function testSprite()
{
	var plugins = ['basicstyles', 'link', 'list', 'table'];
	var pluginsLocation = path.join( assetsDir, "/sprite/plugins" );
	var skinLocation = path.join( assetsDir, "/sprite/skins/v2" );

	// 1. Unminified CSS, use only specified plugins
	ckbuilder.options.all = false;
	ckbuilder.options.leaveCssUnminified = true;

	var imageFile = path.resolve( tempPath + "/sprite/icons.png" );
	var cssFile = path.resolve( tempPath + "/sprite/icons.css" );
	var originalTimestamp = ckbuilder.options.timestamp;

	ckbuilder.options.timestamp = timestampStub;

	try {
		ckbuilder.image.createFullSprite( pluginsLocation, skinLocation, imageFile, cssFile, plugins );
	} catch ( e ) {
		// In any case restore timestamp.
		ckbuilder.options.timestamp = originalTimestamp;
		// And rethrow the exception.
		throw e;
	}

	assertEquals( ckbuilder.io.readFile( path.join( assetsDir, "/sprite/icons.correct.css" ) ), ckbuilder.io.readFile( cssFile ),
		'Checking content of icons.css' );
	assertEquals( ckbuilder.io.exists( imageFile ), true, "Sprite image should exist." );

	var bufferedImage = fs.readFileSync( imageFile );
	var image = new Image;
	image.src = bufferedImage;
	// 14 icons x (21px + 8px)
		// 21 pixels - biggest single icon height
	// 8 pixels - a distance in a non-hidpi strip
	assertEquals( 14 * (21 + 8), image.height, "Checking height of sprite image." );
	assertEquals( 21, image.width, "Checking width of sprite image." );


	// 2. Minified CSS, include icons for all plugins (also the maximize plugin)
	ckbuilder.options.all = true;
	ckbuilder.options.leaveCssUnminified = false;

	imageFile = path.resolve( tempPath + "/sprite/icons2.png" );
	cssFile = path.resolve( tempPath + "/sprite/icons2.css" );

	ckbuilder.image.createFullSprite( pluginsLocation, skinLocation, imageFile, cssFile, plugins );

	assertEquals( ckbuilder.io.readFile( path.join( assetsDir, "/sprite/icons2.correct.css" ) ), ckbuilder.io.readFile( cssFile ),
		'Checking content of icons2.css' );
	assertEquals( ckbuilder.io.exists( imageFile ), true, "Sprite image should exist." );

	var bufferedImage = fs.readFileSync( imageFile );
	var image = new Image;
	image.src = bufferedImage;
	// 15 icons x (21px + 8px)
	// 21 pixels - biggest single icon height
	// 8 pixels - a distance in a non-hidpi strip
	assertEquals( 15 * (21 + 8), image.height, "Checking height of sprite image." );
	assertEquals( 21, image.width, "Checking width of sprite image." );

	// 3. Unminified CSS, use only specified plugins, hidpi
	ckbuilder.options.all = false;
	ckbuilder.options.leaveCssUnminified = true;
	var skinLocation = path.join( assetsDir, "/sprite/skins/sapphire" );

	var imageFile = path.resolve( tempPath + "/sprite/icons3.png" );
	var cssFile = path.resolve( tempPath + "/sprite/icons3.css" );

	ckbuilder.options.timestamp = timestampStub;
	try {
		ckbuilder.image.createFullSprite( pluginsLocation, skinLocation, imageFile, cssFile, plugins, true );
	} catch ( e ) {
		ckbuilder.options.timestamp = originalTimestamp;
		throw e;
	}

	assertEquals( ckbuilder.io.readFile( path.join( assetsDir, "/sprite/icons3.correct.css" ) ), ckbuilder.io.readFile( cssFile ),
		'Checking content of icons3.css' );
	assertEquals( ckbuilder.io.exists( imageFile ), true, "Sprite image should exist." );

	var bufferedImage = fs.readFileSync( imageFile );
	var image = new Image;
	image.src = bufferedImage;
	// 14 icons x (32px + 16px)
	// 32 pixels - biggest single icon height
	// 16 pixels - a distance in a hidpi strip
	assertEquals( 14 * ( 32 + 16 ), image.height, "Checking height of sprite image." );
	assertEquals( 32, image.width, "Checking width of sprite image." );
}

function testDirectives()
{
	console.log( "\nTesting directives\n" );

	var name = 'directives';
	var testName, tempFile, correctFile, sampleFile;

	var dir = path.resolve( assetsDir, 'directives' );
	var dirList = fs.readdirSync( dir );

	for ( var i = 0 ; i < dirList.length ; i++ )
	{
		if ( dirList[i].indexOf( ".correct." ) === -1 )
			continue;

		testName = dirList[i].replace( ".correct.txt", "" );

		sampleFile = path.resolve( dir, testName + '.txt' );
		correctFile = path.resolve( dir, testName + '.correct.txt' );
		tempFile = path.resolve( tempDir, name + '/' + testName + '.out.txt' );

		ckbuilder.io.copy( sampleFile, tempFile );
		ckbuilder.tools.processDirectives( tempFile, { version: '3.1beta', revisionNumber : '1234', timestamp : 'AB89' } );

		assertEquals( ckbuilder.io.readFile( correctFile ), ckbuilder.io.readFile( tempFile ),
			'releaser.directives[' + testName + ']' );
	}
}

function testBom()
{
	var file, extension, stats;
	var dir = path.resolve( tempDir, 'bom' );

	ckbuilder.io.copy( path.resolve( assetsDir, 'bom' ), dir, function( sourceLocation, targetLocation ) {
		if ( !fs.statSync( sourceLocation ).isDirectory() )
			return ckbuilder.tools.fixLineEndings( sourceLocation, targetLocation ) ? 1 : 0;
	} );

	var children = fs.readdirSync( dir );
	for ( var i = 0 ; i < children.length ; i++ )
	{
		file = path.resolve( dir, children[i] );

		extension = ckbuilder.io.getExtension( path.basename( file ) );

		stats = fs.statSync( file );

		switch ( extension )
		{
			case "asp":
			case "js":
				// BOM + CRLF
				assertEquals( 8, stats.size, "testing BOM: " + children[i] );
				break;

			case "sh":
				// !BOM + LF
				assertEquals( 4, stats.size, "testing BOM: " + children[i] );
				break;

			default:
				// !BOM + CRLF
				assertEquals( 5, stats.size, "testing BOM: " + children[i] );
				break;
		}
	}
}

function testLineEndings()
{
	console.log( "\nTesting line endings\n" );
	var testName, tempFile, correctFile, sampleFile;
	var name = "lineendings";
	var dir = path.resolve( assetsDir, 'lineendings' );
	var dirList = fs.readdirSync( dir );

	for ( var i = 0 ; i < dirList.length ; i++ )
	{
		if ( dirList[i].indexOf( ".correct." ) === -1 )
			continue;

		testName = dirList[i].replace( ".correct", "" );

		sampleFile = path.resolve( assetsDir, name + '/' + testName );
		correctFile = path.resolve( assetsDir, name + '/' + dirList[i] );
		tempFile = path.resolve( tempDir, name + '/' + testName );

		ckbuilder.tools.fixLineEndings( sampleFile, tempFile );

		assertEquals( ckbuilder.io.readFile( correctFile ), ckbuilder.io.readFile( tempFile ),
			'testing line endings: [' + testName + ']' );
	}
}

function listFiles( file )
{
	var result = [];

	file = path.relative( path.resolve( '.' ), file );

	if ( fs.statSync( file ).isDirectory() )
	{
		var children = fs.readdirSync( file );
		if ( !children.length )
		{
			result.push( file );
		}
		else
		{
			for ( var i = 0 ; i < children.length ; i++ )
			{
				result.push( listFiles( path.resolve( file, children[i] ) ) );
			}
		}
	}
	else
	{
		result.push( file );
	}

	return result;
}

function testIgnoringPaths()
{
	console.log( "\nTesting ignored paths...\n" );

	var sourceLocation = path.resolve( assetsDir, 'ignored' );
	var targetLocation = path.resolve( tempDir, 'ignored' );

	var ignored = [ 'devtools', 'placeholder/lang/he.js', 'uicolor.js' ];
	ckbuilder.io.copy( sourceLocation, targetLocation , function( sourceLocation, targetLocation ) {
		if ( ckbuilder.config.isIgnoredPath( sourceLocation, ignored ) )
			return -1;
	});

	var files = listFiles( targetLocation );
	files.sort();
	var validResult = [
		'test/tmp/ignored/a11yhelp/lang/en.js',
		'test/tmp/ignored/a11yhelp/lang/he.js',
		'test/tmp/ignored/a11yhelp/plugin.js',
		'test/tmp/ignored/placeholder/dialogs/placeholder.js',
		'test/tmp/ignored/placeholder/lang/en.js',
		'test/tmp/ignored/placeholder/lang/pl.js',
		'test/tmp/ignored/placeholder/plugin.js',
		'test/tmp/ignored/uicolor/lang/en.js',
		'test/tmp/ignored/uicolor/lang/he.js',
		'test/tmp/ignored/uicolor/plugin.js'];

	assertEquals( files.length, 3, "Comparing plugins directories (same number of subfolders?)" );
	var areEqual = files.toString().replace(/\\/g, "/") === validResult.toString();
	assertEquals( true, areEqual, "Comparing plugins directories (are equal?)" );
}

function testLangProps()
{
	console.log( "\nTesting language properties...\n" );

	var sourceLocation = path.resolve( assetsDir, 'langprops' );
	var targetLocation = path.resolve( tempDir, 'langprops' );

	ckbuilder.io.copy( sourceLocation, targetLocation );

	var plugins = {
		devtools : {
			test : { en : 1, pl : 1, foo : 1 },
			expected : ['en', 'pl']
		},
		div : {
			test: { foo : 1, bar : 1 },
			expected: false
		},
		find : {
			test : { en : 1, pl : 1, 'zh-cn' : 1, fr : 0 },
			expected : ['en', 'pl', 'zh-cn']
		},
		colordialog : {
			test : { en : 1, pl : 1, 'zh-cn' : 1, fr : 1 },
			expected : ['en', 'pl', 'zh-cn', 'fr']
		},
		liststyle : {
			test : { en : 1, pl : 1, 'zh-cn' : 1, he : 1 },
			expected : ['en', 'pl', 'zh-cn', 'he']
		},
		magicline : {
			test : { en : 1, pl : 1, foo : 1 },
			expected : true
		},
		specialchar : {
			test : { en : 1, pl : 1, 'zh-cn' : 1, he : 1 },
			expected : ['en', 'pl', 'zh-cn', 'he']
		}
	};

	for ( var plugin in plugins )
	{
		assertEquals( plugins[plugin].expected, ckbuilder.plugin.updateLangProperty( path.resolve( targetLocation, 'plugins/' + plugin + '/plugin.js'), plugins[plugin].test ), "lang property (" + plugin + ")" );
		assertFilesAreEqual( path.resolve( sourceLocation, 'plugins_correct/' + plugin + '/plugin.js'), path.resolve( targetLocation, 'plugins/' + plugin + '/plugin.js') );
	}
}

ckbuilder.plugin.updateLangProperty(path.resolve("test/_assets/requires/plugin_hr.js"), 'en.pl');

function testMinification()
{
	console.log( "\nTesting minification...\n" );

	var sourceLocation = path.resolve( assetsDir, 'minification' );
	var targetLocation = path.resolve( tempDir, 'minification' );

	ckbuilder.io.copy( sourceLocation, targetLocation , null, function( targetLocation ) {
		if ( ckbuilder.io.getExtension( path.basename( targetLocation ) ) === 'js'  )
			ckbuilder.javascript.minify( targetLocation );
	} );

	var testName, tempFile, correctFile;
	var dir = path.resolve( tempDir, 'minification' );
	var dirList = fs.readdirSync( dir );

	for ( var i = 0 ; i < dirList.length ; i++ )
	{
		if ( dirList[i].indexOf( ".correct" ) === -1 )
			continue;

		testName = dirList[i].replace( ".correct", "" );

		correctFile = path.resolve( dir, testName + '.correct' );
		tempFile = path.resolve( dir, testName );

		assertEquals( ckbuilder.io.readFile( correctFile ), ckbuilder.io.readFile( tempFile ),
			'minification[' + testName + ']' );
	}
}

function testRequiredPlugins()
{
	console.log( "\nTesting required plugins...\n" );

	var assetsLocation = path.resolve( assetsDir, 'requires' );
	assertEquals( ['dialog', 'fakeobjects'], ckbuilder.plugin.getRequiredPlugins(path.resolve( assetsLocation, "plugin_flash.js" )));
	assertEquals( ['richcombo'], ckbuilder.plugin.getRequiredPlugins(path.resolve( assetsLocation, "plugin_font.js" )));
	assertEquals( ['dialog', 'fakeobjects'], ckbuilder.plugin.getRequiredPlugins(path.resolve( assetsLocation, "plugin_link.js" )));
	assertEquals( ['floatpanel'], ckbuilder.plugin.getRequiredPlugins(path.resolve( assetsLocation, "plugin_menu.js" )));
	assertEquals( [], ckbuilder.plugin.getRequiredPlugins(path.resolve( assetsLocation, "plugin_xml.js" )));
	assertEquals( [], ckbuilder.plugin.getRequiredPlugins(path.resolve( assetsLocation, "plugin_hr.js" )));
	assertEquals( [], ckbuilder.plugin.getRequiredPlugins(path.resolve( assetsLocation, "plugin_hr2.js" )));
	assertEquals( ['foo'], ckbuilder.plugin.getRequiredPlugins(path.resolve( assetsLocation, "plugin_hr3.js" )));
	assertEquals( ['dialog', 'contextmenu'], ckbuilder.plugin.getRequiredPlugins(path.resolve( assetsLocation, "plugin_liststyle.js" )));
}

function testSkinBuilder()
{
	console.log( "\nTesting skin builder...\n" );

	var originalTimestamp = ckbuilder.options.timestamp;

	// Stub the timestamp.
	ckbuilder.options.timestamp = timestampStub;
	ckbuilder.options.leaveCssUnminified = true;
	var sourceLocation = path.resolve( assetsDir, 'skins/kama' );
	var correctResultLocation = path.resolve( assetsDir, 'skins/kama_correct' );
	var targetLocation = path.resolve( tempDir, 'skins/kama' );

	try {
		ckbuilder.skin.build( sourceLocation, targetLocation );
		assertDirectoriesAreEqual( correctResultLocation, targetLocation, 'Checking skin builder (CSS minification disabled)' );

		ckbuilder.options.leaveCssUnminified = false;
		var sourceLocation = path.resolve( assetsDir, 'skins_minified/kama' );
		var correctResultLocation = path.resolve( assetsDir, 'skins_minified/kama_correct' );
		var targetLocation = path.resolve( tempDir, 'skins_minified/kama' );

		ckbuilder.skin.build( sourceLocation, targetLocation );
		assertDirectoriesAreEqual( correctResultLocation, targetLocation, 'Checking skin builder (CSS minification enabled)' );
	} catch ( e ) {
		// In any case restore timestamp.
		ckbuilder.options.timestamp = originalTimestamp;
		// And rethrow the exception.
		throw e;
	}
}

function testVerifyPlugins()
{
	console.log( "\nTesting plugins verification...\n" );

	var pluginsLocation = path.resolve( assetsDir, 'verify_plugins' );
	var dirList = fs.readdirSync( pluginsLocation );
	var plugins = {
		'_pubme_extratags_1_1.zip' : { name : '_pubme_extratags',  expected : 'OK' },
		'apinstein-ckeditor-autocss-2e37374.zip' : { name : 'autocss',  expected : 'OK' },
		'autosave_1.0.2.zip' : { name : 'autosave',  expected : 'OK' },
		'confighelper1.2.zip' : { name : 'confighelper',  expected : 'OK' },
		'fakeelements_checkbox_radio_select.zip' : { name : 'formchanges',  expected : 'OK' },
		'groupedcolorbutton.zip' : { name : 'groupedcolorbutton',  expected : 'OK' },
		'highlite_source_with_codemirror.zip' : { name : 'highlightsource',  expected : "The plugin name defined inside plugin.js (sourcepopup) does not match the expected plugin name (highlightsource)\n" },
		'htmlbuttons1.0.zip' : { name : 'htmlbuttons',  expected : 'OK' },
		'imagepaste1.0.zip' : { name : 'imagepaste',  expected : 'OK' },
		'insert-edit_source_code_icons.zip' : { name : 'insertedit',  expected : "The plugin name defined inside plugin.js (scriptcode) does not match the expected plugin name (insertedit)\n" },
		'languages.zip' : { name : 'languages',  expected : 'OK' },
		'lightbox_plus.zip' : { name : 'lightboxplus',  expected : "The plugin name defined inside plugin.js (lightbox) does not match the expected plugin name (lightboxplus)\n" },
		'links_to_own_pages.zip' : { name : 'linktoown',  expected : "The plugin name defined inside plugin.js (internpage) does not match the expected plugin name (linktoown)\n" },
		'loremIpsum.zip' : { name : 'loremipsum',  expected : "The plugin name defined inside plugin.js (loremIpsum) does not match the expected plugin name (loremipsum)\n" },
		'onchange1.5.zip' : { name : 'onchange',  expected : 'OK' },
		'small_google_map.zip' : { name : 'gmap',  expected : 'OK' },
		'smallerselection0.1.zip' : { name : 'smallerselection',  expected : 'OK' },
		'video1.3.zip' : { name : 'video',  expected : 'OK' },
		'w8tcha-CKEditor-oEmbed-Plugin-481d449.zip' : { name : 'oEmbed',  expected : "Found more than one plugin.js:\n/w8tcha-CKEditor-oEmbed-Plugin-481d449/oEmbed_CKEditor3/oEmbed/plugin.js\n/w8tcha-CKEditor-oEmbed-Plugin-481d449/oEmbed_CKEditor4/oEmbed/plugin.js\n" },
		'whitelist1.0.zip' : { name : 'whitelist',  expected : 'OK' },
		'xmltemplates1.0.zip' : { name : 'xmltemplates',  expected : 'OK' },
		'youtube.zip' : { name : 'youtube',  expected : 'OK' },
		'youtube_mp3.zip' : { name : 'youtube',  expected : "Found more than one plugin.js:\n/youtube_mp3/mp3player/plugin.js\n/youtube_mp3/youtube/plugin.js\n" },
		'zoom1.0.zip' : { name : 'zoom', expected : 'OK' }
	};

	for ( var i = 0 ; i < dirList.length ; i++ )
	{
		var file = path.resolve( pluginsLocation, dirList[i] );
		if ( fs.statSync( file ).isDirectory() )
		{
			assertEquals( "OK", ckbuilder.plugin.verify( file, { pluginName : path.basename( file ) } ) );
		}
		else
		{
			assertEquals( plugins[path.basename( file ) ].expected, ckbuilder.plugin.verify( file, { pluginName : plugins[ path.basename( file ) ].name } ) );
		}
		//console.log('Checking ' + file.getPath());

	}
}

function testVerifySkins()
{
	console.log( "\nTesting skins verification...\n" );

	var skinsLocation = path.resolve( assetsDir, 'verify_skins' );
	var dirList = fs.readdirSync( skinsLocation );

	for ( var i = 0 ; i < dirList.length ; i++ )
	{
		var file = path.resolve( skinsLocation, dirList[i] );
		if ( fs.statSync( file ).isDirectory() )
		{
			if ( path.basename( file ) == "fake" ) {
				assertEquals( "The skin name defined inside skin.js (kama) does not match the expected skin name (fake)\n", ckbuilder.skin.verify( file, { skinName : path.basename( file ) } ));
			}
			else if ( path.basename( file ) == "noicons" ) {
				assertEquals( "OK", ckbuilder.skin.verify( file, { skinName : path.basename( file ) } ));
			}
			else {
				assertEquals( "OK", ckbuilder.skin.verify( file, { skinName : path.basename( file ) } ));
			}
		}
	}
}

function testSamples()
{
	console.log( "\nTesting samples merging...\n" );

	var samplesLocation = path.resolve( assetsDir, 'samples/ckeditor-dev' );
	var targetLocation = path.resolve( tempDir, 'samples' );
	ckbuilder.io.copy( samplesLocation, targetLocation );
	ckbuilder.samples.mergeSamples( targetLocation );

	var correctResultLocation = path.resolve( assetsDir, 'samples/ckeditor-dev-correct' );
	assertDirectoriesAreEqual( correctResultLocation, targetLocation, 'Checking merged samples' );

}

function testCopyrights()
{
	console.log( "\nTesting copyrights...\n" );
	ckbuilder.options.commercial = true;
	ckbuilder.options.leaveJsUnminified = true;
	var sourceLocation = path.resolve( assetsDir, 'copyrights' );
	var targetLocation = path.resolve( tempDir, 'copyrights' );
	ckbuilder.io.copy( sourceLocation, targetLocation );

	var testName, tempFile, correctFile;
	var dir = path.resolve( tempDir, 'copyrights' );
	var dirList = fs.readdirSync( dir );

	for ( var i = 0 ; i < dirList.length ; i++ )
	{
		if ( dirList[i].indexOf( ".correct" ) === -1 )
			continue;

		testName = dirList[i].replace( ".correct", "" );

		correctFile = path.resolve( dir, testName + '.correct' );
		tempFile = path.resolve( dir, testName );
		ckbuilder.tools.updateCopyrights( tempFile );

		assertEquals( ckbuilder.io.readFile( correctFile ), ckbuilder.io.readFile( tempFile ),
				'copyrights[' + testName + ']' );
	}
	ckbuilder.options.commercial = false;
	ckbuilder.options.leaveJsUnminified = false;
}

prepareTempDirs();
testLangProps();
testLanguageFiles();
testSprite();
testCssProcessor( "/css", true );
testCssProcessor( "/css_minified", false );
testDirectives();
testBom();
testLineEndings();
testIgnoringPaths();
testMinification();
testRequiredPlugins();
testSkinBuilder();
testVerifyPlugins();
testVerifySkins();
testSamples();
testCopyrights();

console.log( '' );
console.log( 'Finished: ' + passCount + ' passed / ' + failCount + ' failed' );
