/*
 Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
 For licensing, see LICENSE.md
 */

"use strict";

var fs = require( "fs-extra" );
var path = require( "path" );
var vm = require( "vm" );
var ckbuilder = {
	io: require( "./io" ),
	plugin: require( "./plugin" ),
	lang: require( "./lang" ),
	config: require( "./config" ),
	css: require( "./css" ),
	image: require( "./image" ),
	samples: require( "./samples" ),
	javascript: require( "./javascript" ),
	tools: require( "./tools" ),
	utils: require( "./utils" ),
	options: require( "./options" ),
	error: require( "./error" )
};

/**
 * Responsible for preprocess core, generate build and generate core.
 *
 * @class
 * @param {String} srcDir
 * @param {String} dstDir
 */
var builder = function( srcDir, dstDir ) {
	/**
	 * Build configuration.
	 *
	 * @property {Object} config
	 */
	var config = {};

	/**
	 * The main target skin file.
	 *
	 * @type {java.io.File}
	 */
	var targetSkinFile;

	/**
	 * The main source skin file.
	 *
	 * @type {java.io.File}
	 */
	var sourceSkinFile;

	/**
	 * The main language file.
	 *
	 * @type {java.io.File}
	 */
	var languageFile;

	/**
	 * The list of "core" scripts.
	 * "Helper" variable used to mark script as loaded in "coreScriptsSorted".
	 *
	 * @type {Object}
	 */
	var coreScripts = {};

	/**
	 * The list of "core" scripts, sorted by the loading order.
	 *
	 * @type {Array}
	 */
	var coreScriptsSorted = [];

	/**
	 * The hash map with the list of plugins to include in ckeditor.js.
	 * The key is the name of the plugin.
	 * The value indicates whether the plugin is included in ckeditor.js (true).
	 *
	 * @type {Object}
	 */
	var pluginNames = {};

	/**
	 * The list of plugin files to include in ckeditor.js, sorted by the loading order.
	 *
	 * @type {Object}
	 */
	var sourcePluginFilesSorted = [];

	/**
	 * The list of plugin files to include in ckeditor.js, sorted by the loading order.
	 *
	 * @type {Object}
	 */
	var targetPluginFilesSorted = [];

	/**
	 * Paths to extra files to be included in ckeditor.js, defined by the "js" property.
	 *
	 * @type {Object}
	 */
	var extraCoreJavaScriptFiles = null;

	/**
	 * The extra code to be included in ckeditor.js, defined by the "js" property,
	 *
	 * @type {Object}
	 */
	var extraCoreJavaScriptCode = {};

	/**
	 * The list of plugin names to include in ckeditor.js, sorted by the loading order.
	 *
	 * @type {Array}
	 */
	var pluginNamesSorted = [];

	/**
	 * The "scripts" definition in the loader file.
	 *
	 * @type {Array}
	 */
	var loaderScripts;

	/**
	 * Source location with CKEditor source files.
	 *
	 * @type {java.io.File}
	 */
	var sourceLocation = path.resolve( srcDir );

	/**
	 * Target location where the release will be built.
	 *
	 * @type {java.io.File}
	 */
	var targetLocation = path.resolve( dstDir, 'ckeditor' );

	/**
	 * Checks for some required files/folders and throws an error in case of missing items.
	 */
	function validateSourceFolder() {
		if ( !ckbuilder.io.exists( sourceLocation ) ) {
			ckbuilder.error( 'Source folder does not exist: ' + srcDir );
		}
		if ( !fs.statSync( sourceLocation ).isDirectory() ) {
			ckbuilder.error( 'Source folder is not a directory: ' + srcDir );
		}
		var requiredFiles = [
			'lang/' + ( config.language || process.env.DEFAULT_LANGUAGE || 'en' ) + '.js',
			'core/loader.js',
			'ckeditor.js',
			'lang',
			'plugins'
		];
		if ( config.skin ) {
			requiredFiles.push( 'skins/' + config.skin + '/skin.js' );
		}

		for ( var i = 0; i < requiredFiles.length; i++ ) {
			var file = path.resolve( sourceLocation, requiredFiles[ i ] );
			if ( !ckbuilder.io.exists( file ) ) {
				throw( 'The source directory is not invalid. The following file is missing: ' + file );
			}
		}
	}

	/**
	 * Initializes all variables required during the build process.
	 */
	function init() {
		if ( config.skin ) {
			sourceSkinFile = path.resolve( sourceLocation, 'skins/' + ( config.skin ) + '/skin.js' );
			targetSkinFile = path.resolve( targetLocation, 'skins/' + ( config.skin ) + '/skin.js' );
		}
		languageFile = path.resolve( targetLocation, 'lang/' + ( config.language || process.env.DEFAULT_LANGUAGE || 'en' ) + '.js' );
		var loaderFile = path.resolve( sourceLocation, 'core/loader.js' );

		/*
		 * Execute script loader.js in core directory and read
		 * CKEDITOR.loader.scripts property
		 */
		loaderScripts = ( function() {
			var code = 'var CKEDITOR = { basePath : \'/ckeditor/\' }; ' + ckbuilder.io.readFile( loaderFile );
			var script = new vm.Script( code, { filename: loaderFile } );
			var scope = {};
			vm.createContext( scope );

			try {
				script.runInContext( scope );
				return scope.CKEDITOR.loader.scripts;
			} catch ( e ) {
				throw( 'Invalid JavaScript file: ' + loaderFile + '.\nError: ' + e.message );
			}
		}() );

		if ( !loaderScripts ) {
			throw( 'Unable to get required scripts from loader: ' + loaderFile );
		}

		if ( ckbuilder.options.debug ) {
			console.log( 'Reading core files from loader' );
		}

		getCoreScripts( 'ckeditor' );
		getCoreScripts( '_bootstrap' );

		if ( ckbuilder.options.debug ) {
			console.log( 'Checking plugins dependency' );
		}

		findAllRequiredPlugins( getPluginsFromBuildConfig() );
	}

	/**
	 * Generates arrays with the list of core files to include.
	 *
	 * @param {String} scriptName
	 */
	function getCoreScripts( scriptName ) {
		// Check if the script has already been loaded.
		if ( scriptName === 'ckeditor_base' || scriptName in coreScripts ) {
			return;
		}

		// Get the script dependencies list.
		var dependencies = loaderScripts[ scriptName ];
		if ( !dependencies ) {
			throw( 'The script name"' + scriptName + '" is not defined.' );
		}

		// Mark as loaded
		coreScripts[ scriptName ] = true;

		// Load all dependencies first.
		for ( var i = 0; i < dependencies.length; i++ ) {
			getCoreScripts( dependencies[ i ] );
		}

		if ( ckbuilder.options.debug > 1 ) {
			console.log( 'Found core script to load: core/' + scriptName + '.js' );
		}

		var file = path.resolve( sourceLocation, 'core/' + scriptName + '.js' );
		coreScriptsSorted.push( file );
	}

	/**
	 * Returns an array with plugins enabled in the builder configuration file.
	 *
	 * @returns {Array}
	 */
	function getPluginsFromBuildConfig() {
		var plugins = [];

		for ( var plugin in config.plugins ) {
			if ( config.plugins[ plugin ] ) {
				plugins.push( plugin );
			}
		}

		return plugins;
	}

	/**
	 * Generates arrays with the list of all plugins to include.
	 *
	 * @param {Array} plugins
	 */
	function findAllRequiredPlugins( plugins ) {
		var pluginFile;

		for ( var i = 0; i < plugins.length; i++ ) {
			if ( plugins[ i ] in pluginNames ) {
				continue;
			}

			pluginFile = path.resolve( sourceLocation, 'plugins/' + plugins[ i ] + '/plugin.js' );
			if ( !ckbuilder.io.exists( pluginFile ) ) {
				throw( 'Plugin does not exist: ' + plugins[ i ] + '. Unable to open: ' + pluginFile );
			} else {
				var required = ckbuilder.plugin.getRequiredPlugins( pluginFile );
				if ( required.length ) {
					pluginNames[ plugins[ i ] ] = false;
					findAllRequiredPlugins( required );
				}

				// Previous call to findAllRequiredPlugins() could have added our plugin to the array.
				if ( !( plugins[ i ] in pluginNames ) || !pluginNames[ plugins[ i ] ] ) {
					pluginNames[ plugins[ i ] ] = true;
					sourcePluginFilesSorted.push( path.resolve( sourceLocation, 'plugins/' + plugins[ i ] + '/plugin.js' ) );
					targetPluginFilesSorted.push( path.resolve( targetLocation, 'plugins/' + plugins[ i ] + '/plugin.js' ) );
					pluginNamesSorted.push( plugins[ i ] );
				}
			}
		}
	}

	/**
	 * Delete unused files in the destination folder.
	 */
	function deleteUnusedFiles() {
		ckbuilder.io.deleteDirectory( path.join( targetLocation, 'core' ) );

		for ( var i = 0; i < targetPluginFilesSorted.length; i++ ) {
			var empty = true;
			var parentDir = path.dirname( targetPluginFilesSorted[ i ] );
			var dirList = fs.readdirSync( parentDir );

			for ( var j = 0; j < dirList.length; j++ ) {
				if ( String( dirList[ j ] ) === 'icons' ) {
					ckbuilder.io.deleteDirectory( path.join( parentDir, dirList[ j ] ) );
				} else if ( String( dirList[ j ] ) === 'lang' ) {
					ckbuilder.io.deleteDirectory( path.join( parentDir, dirList[ j ] ) );
				} else if ( String( dirList[ j ] ) === 'plugin.js' ) {
					ckbuilder.io.deleteFile( path.join( parentDir, dirList[ j ] ) );
				} else {
					empty = false;
				}
			}

			if ( empty ) {
				ckbuilder.io.deleteDirectory( parentDir );
			}
		}
	}

	/**
	 * Remove unused plugins (not included in the build configuration file) from the plugins folder.
	 * Executed only when skip-omitted-in-build-config is enabled.
	 */
	function filterPluginFolders() {
		var pluginsFolder = path.join( targetLocation, 'plugins' );
		if ( !ckbuilder.io.exists( pluginsFolder ) ) {
			return;
		}
		var dirList = fs.readdirSync( pluginsFolder );
		for ( var i = 0; i < dirList.length; i++ ) {
			if ( !pluginNames[ dirList[ i ] ] ) {
				if ( ckbuilder.options.debug > 1 ) {
					console.log( 'Removing unused plugin: ' + dirList[ i ] );
				}
				ckbuilder.io.deleteDirectory( path.join( pluginsFolder, dirList[ i ] ) );
			}
		}
	}

	/**
	 * Remove unused skins (not included in the build configuation file) from the skins folder.
	 * Executed only when skip-omitted-in-build-config is enabled.
	 * @param {String} selectedSkin
	 */
	function filterSkinsFolders( selectedSkin ) {
		var skinsFolder = path.join( targetLocation, 'skins' );
		if ( !ckbuilder.io.exists( skinsFolder ) ) {
			return;
		}

		var dirList = fs.readdirSync( skinsFolder );
		for ( var i = 0; i < dirList.length; i++ ) {
			if ( String( dirList[ i ] ) !== selectedSkin ) {
				if ( ckbuilder.options.debug > 1 ) {
					console.log( 'Removing unused skin: ' + dirList[ i ] );
				}
				ckbuilder.io.deleteDirectory( path.join( skinsFolder, dirList[ i ] ) );
			}
		}
	}

	/**
	 * Build skins in the skins folder.
	 * @private
	 */
	function buildSkins() {
		var skinsLocation = path.join( targetLocation, 'skins' );
		var pluginsLocation = path.join( sourceLocation, 'plugins' );
		if ( !ckbuilder.io.exists( skinsLocation ) ) {
			return;
		}

		var dirList = fs.readdirSync( skinsLocation );
		for ( var i = 0; i < dirList.length; i++ ) {
			var skinLocation = path.join( skinsLocation, dirList[ i ] );
			if ( fs.statSync( skinLocation ).isDirectory() ) {
				if ( ckbuilder.options.debug > 1 ) {
					console.log( 'Building skin: ' + dirList[ i ] );
				}

				var outputFile = path.join( skinLocation, 'icons.png' );
				var outputCssFile = path.join( skinLocation, 'editor.css' );
				ckbuilder.image.createFullSprite( pluginsLocation, skinLocation, outputFile, outputCssFile, pluginNamesSorted );

				outputFile = path.join( skinLocation, 'icons_hidpi.png' );
				ckbuilder.image.createFullSprite( pluginsLocation, skinLocation, outputFile, outputCssFile, pluginNamesSorted, true );

				ckbuilder.css.mergeCssFiles( skinLocation );
				var iconsDir = path.join( skinLocation, 'icons' );
				if ( ckbuilder.io.exists( iconsDir ) ) {
					ckbuilder.io.deleteDirectory( path.join( skinLocation, 'icons' ) );
				}
			}
		}
	}

	/**
	 * Copies files form source to the target location.
	 * The following actions are additionally executed:
	 *  - line endings are fixed
	 *  - directives are processed
	 *  - JS files are minified
	 *
	 * @private
	 */
	function copyFiles( context ) {
		var flags = {};
		var coreLocation = path.join( sourceLocation, 'core' );

		ckbuilder.io.copy( sourceLocation, targetLocation, function( sourceLocation, targetLocation ) {
				if ( ckbuilder.config.isIgnoredPath( sourceLocation, config.ignore ) ) {
					return -1;
				}

				if ( extraCoreJavaScriptFiles && extraCoreJavaScriptFiles[ sourceLocation ] ) {
					return -1;
				}

				if ( fs.statSync( sourceLocation ).isFile() ) {
					if ( context === 'build' && 'languages' in config ) {
						try {
							// Find the "lang" folder inside plugins' folders and ignore language files that are not selected
							if ( path.basename( path.dirname( sourceLocation ) ) === 'lang' && path.basename( path.dirname( path.dirname( path.dirname( sourceLocation ) ) ) ) === 'plugins' && ckbuilder.io.exists( path.join( path.dirname( path.dirname( sourceLocation ) ), 'plugin.js' ) ) ) {
								var fileName = path.basename( sourceLocation );
								var langFile = fileName.match( /^([a-z]{2}(?:-[a-z]+)?)\.js$/ );

								if ( langFile ) {
									var langCode = langFile[ 1 ];
									if ( !config.languages[ langCode ] ) {
										return -1;
									}
								}
							}
						} catch ( e ) {
						}
					}
					var copied = ckbuilder.tools.fixLineEndings( sourceLocation, targetLocation );
					if ( copied ) {
						if ( ckbuilder.options.commercial ) {
							ckbuilder.tools.updateCopyrights( targetLocation );
						}

						var flag = ckbuilder.tools.processDirectives( targetLocation );
						if ( flag.LEAVE_UNMINIFIED ) {
							flags[ targetLocation ] = flag;
						}

						return 1;
					}
				} else {
					if ( coreLocation === sourceLocation ) {
						return -1;
					}

					// No plugins specified, special case to be able to build core only
					if ( !pluginNamesSorted.length && path.basename( sourceLocation ) === "plugins" ) {
						return -1;
					}

					// No skins specified, special case to be able to build core only
					if ( typeof config.skin !== 'undefined' && !config.skin && path.basename( sourceLocation ) === "skins" ) {
						return -1;
					}

				}
				return 0;
			}, function( targetLocation ) {
				if ( ckbuilder.options.leaveJsUnminified ) {
					return;
				}

				if ( ckbuilder.io.getExtension( path.basename( targetLocation ) ) === 'js' ) {
					var targetPath = path.resolve( targetLocation );
					if ( flags[ targetPath ] && flags[ targetPath ].LEAVE_UNMINIFIED ) {
						if ( ckbuilder.options.debug > 1 ) {
							console.log( "Leaving unminified: " + targetLocation );
						}

						ckbuilder.io.saveFile( targetLocation, ckbuilder.tools.removeLicenseInstruction( ckbuilder.io.readFile( targetLocation ) ), true );
						return;
					}

					if ( context === 'build' && 'languages' in config && path.basename( targetLocation ) === 'plugin.js' ) {
						try {
							if ( path.basename( path.dirname( path.dirname( targetLocation ) ) ) === 'plugins' && ckbuilder.io.exists( path.join( path.dirname( targetLocation ), "lang" ) ) ) {
								var result = ckbuilder.plugin.updateLangProperty( targetLocation, config.languages );

								// Something went wrong...
								if ( result === false ) {
									console.log( "WARNING: it was impossible to update the lang property in " + targetLocation );
								}
							}
						} catch ( e ) {
						}
					}

					if ( ckbuilder.options.debug ) {
						console.log( "Minifying: " + targetLocation );
					}

					ckbuilder.javascript.minify( targetLocation );
				}
			}
		);
	}

	/**
	 * Creates sprite image from icons provided by plugins.
	 *
	 * @returns {String} Returns JavaScript code that registers created icons.
	 * @private
	 */
	function createPluginsSpriteImage() {
		var iconsCode = "";
		if ( !pluginNamesSorted.length ) {
			return "";
		}

		console.log( "Generating plugins sprite image" );
		var sourcePluginsLocation = path.join( sourceLocation, "plugins" );
		var targetPluginsLocation = path.join( targetLocation, "plugins" );
		fs.ensureDirSync( targetPluginsLocation );

		var outputFile = path.join( targetPluginsLocation, "icons.png" );
		var outputFileHidpi = path.join( targetPluginsLocation, "icons_hidpi.png" );
		var iconsOffset = ckbuilder.image.createFullSprite( sourcePluginsLocation, null, outputFile, null, pluginNamesSorted );
		var iconsOffsetHidpi = ckbuilder.image.createFullSprite( sourcePluginsLocation, null, outputFileHidpi, null, pluginNamesSorted, true );

		if ( iconsOffset ) {
			iconsCode = "(function() {" + "var setIcons = function(icons, strip) {" + "var path = CKEDITOR.getUrl( 'plugins/' + strip );" + "icons = icons.split( ',' );" + "for ( var i = 0; i < icons.length; i++ )" + "CKEDITOR.skin.icons[ icons[ i ] ] = { path: path, offset: -icons[ ++i ], bgsize : icons[ ++i ] };" + "};" + "if (CKEDITOR.env.hidpi) " + "setIcons('" + iconsOffsetHidpi + "','icons_hidpi.png');" + "else " + "setIcons('" + iconsOffset + "','icons.png');" + "})();";
		}

		return iconsCode;
	}

	/**
	 * Creates ckeditor.js.
	 *
	 * @param {Object} config
	 * @param {String} extraCode JavaScript code to include in ckeditor.js
	 * @param {Boolean} apply7588 Whether to include patch for #7588
	 * @param {String} context (build|preprocess) In build,
	 * @private
	 */
	function createCore( config, extraCode, apply7588, context ) {
		var ckeditorjs = "";
		var patch7588 = 'if(window.CKEDITOR&&window.CKEDITOR.dom)return;';

		if ( extraCoreJavaScriptCode && extraCoreJavaScriptCode.start ) {
			ckeditorjs += extraCoreJavaScriptCode.start.join( "\n" );
		}

		ckeditorjs += ckbuilder.io.readFile( path.join( sourceLocation, "core/ckeditor_base.js" ) ) + "\n";
		ckeditorjs += ckbuilder.io.readFiles( coreScriptsSorted, "\n" );

		if ( extraCoreJavaScriptCode && extraCoreJavaScriptCode.aftercore ) {
			ckeditorjs += extraCoreJavaScriptCode.aftercore.join( "\n" );
		}

		if ( sourceSkinFile ) {
			ckeditorjs += ckbuilder.io.readFile( sourceSkinFile ) + "\n";
		}

		if ( pluginNamesSorted.length > 0 ) {
			var configEntry = "CKEDITOR.config.plugins='" + pluginNamesSorted.join( "," ) + "';";
			ckeditorjs += ckbuilder.io.readFiles( sourcePluginFilesSorted, "\n" ) + "\n" + configEntry;
		}
		// When the core is created for the preprocessed version of CKEditor, then it makes no sense to
		// specify an empty "config.plugins", because config.plugins will be later set by the online builder.
		else if ( 'build' === context ) {
			ckeditorjs += "CKEDITOR.config.plugins='';";
		}

		if ( config.language ) {
			ckeditorjs += ckbuilder.io.readFile( languageFile ) + "\n" ;
		}

		ckeditorjs = ckbuilder.tools.processDirectivesInString( ckeditorjs );
		ckeditorjs = ckbuilder.tools.processCoreDirectivesInString( ckeditorjs );
		ckeditorjs = ckbuilder.tools.removeLicenseInstruction( ckeditorjs );

		if ( extraCode ) {
			ckeditorjs += extraCode + "\n";
		}

		if ( 'build' === context && config.languages ) {
			var langs = [];
			for ( var lang in config.languages ) {
				if ( config.languages[ lang ] ) {
					langs.push( '"' + lang + '":1' );
				}
			}

			if ( langs.length ) {
				ckeditorjs += "CKEDITOR.lang.languages={" + langs.join( ',' ) + "};";
			}
		}

		// http://dev.ckeditor.com/ticket/7588
		if ( apply7588 ) {
			ckeditorjs = ckbuilder.utils.wrapInFunction( patch7588 + ckeditorjs );
		}

		if ( extraCoreJavaScriptCode && extraCoreJavaScriptCode.end ) {
			ckeditorjs += extraCoreJavaScriptCode.end.join( "" );
		}

		var targetFile = path.join( targetLocation, "ckeditor.js" );
		ckbuilder.io.saveFile( targetFile, ckeditorjs, true );

		if ( !ckbuilder.options.leaveJsUnminified ) {
			console.log( "Minifying ckeditor.js" );
			ckbuilder.javascript.minify( targetFile );
		}
		ckbuilder.io.saveFile( targetFile, ckbuilder.utils.copyright( ckbuilder.options.leaveJsUnminified ? "\r\n" : "\n" ) + ckbuilder.io.readFile( targetFile ), true );
		console.log( "Created ckeditor.js (" + parseInt( fs.statSync( targetFile ).size / 1024, 10 ) + "KB)" );
	}

	/**
	 * Reads configuration file and returns configuration object.
	 *
	 * @returns {Object}
	 * @private
	 */
	function readConfig() {
		var configPath = ckbuilder.options.buildConfig || 'build-config.js';
		var configFile = path.resolve( configPath );

		if ( !ckbuilder.io.exists( configFile ) ) {
			ckbuilder.error( 'The build configuration file was not found: ' + configPath + "\nRun:\n    node ckbuilder.js SRC --generate-build-config" );
		}
		config = ckbuilder.config.read( configFile );

		if ( config.js ) {
			extraCoreJavaScriptFiles = {};
			extraCoreJavaScriptCode = { start: [], aftercore: [], end: [] };

			for ( var i = 0; i < config.js.length; i++ ) {
				var regexInstruction = new RegExp( '^([\\S\\s]*),(aftercore|end|start)$', 'gm' );
				var matcher = regexInstruction.exec( config.js[ i ] );
				var instruction;
				var file;
				var filePath;

				if ( matcher !== null ) {
					filePath = matcher[ 1 ];
					instruction = matcher[ 2 ];
				} else {
					filePath = config.js[ i ];
					instruction = 'end';
				}
				file = path.resolve( filePath );
				if ( !ckbuilder.io.exists( file ) ) {
					ckbuilder.error( "File not found: " + file + "\nCheck the build configuration file." );
				}

				extraCoreJavaScriptFiles[ file ] = true;

				if ( ckbuilder.options.debug ) {
					console.log( 'Adding extra file [' + instruction + ']: ' + filePath );
				}

				extraCoreJavaScriptCode[ instruction ].push( ckbuilder.io.readFile( file ) );
			}
		}

		return config;
	}

	return {
		/**
		 * Preprocess CKEditor core.
		 *
		 * @static
		 */
		preprocess: function() {
			var time = new Date();
			var config = readConfig();

			config.plugins = {};
			config.skin = '';
			config.language = false;

			validateSourceFolder();
			ckbuilder.tools.prepareTargetFolder( path.resolve( dstDir ) );
			init();
			console.log( "Copying files (relax, this may take a while)" );
			copyFiles( 'preprocess' );
			time = ckbuilder.utils.printUsedTime( time );

			console.log( "Merging language files" );
			var langFolder = path.join( targetLocation, 'lang' );
			ckbuilder.lang.mergeAll( sourceLocation, langFolder, {}, config.languages );
			time = ckbuilder.utils.printUsedTime( time );

			console.log( "Processing lang folder" );
			var children = fs.readdirSync( langFolder );
			for ( var i = 0; i < children.length; i++ ) {
				if ( children[ i ].match( /^([a-z]{2}(?:-[a-z]+)?)\.js$/ ) ) {
					var langFile = path.join( langFolder, children[ i ] );
					var translation = ckbuilder.lang.loadLanguageFile( langFile ).translation;
					var pseudoObject = JSON.stringify( translation ).replace( /^\{(.*)\}$/, '$1' );

					ckbuilder.io.saveFile( langFile, pseudoObject, true );
				}
			}

			console.log( "Building ckeditor.js" );
			createCore( config, "", false, 'preprocess' );

			console.log( "Cleaning up target folder" );
			deleteUnusedFiles();
			ckbuilder.utils.printUsedTime( time );
		},

		/**
		 * Creates ckeditor.js and icons.png in the target folder.
		 *
		 * @static
		 */
		generateCore: function() {
			var time = new Date();
			var config = readConfig();

			validateSourceFolder();
			init();

			config.language = false;
			var iconsCode = createPluginsSpriteImage();
			console.log( "Building ckeditor.js" );
			var extraCode = '';
			if ( config.skin ) {
				extraCode = "CKEDITOR.config.skin='" + config.skin + "';";
			}
			createCore( config, extraCode + iconsCode, true, 'build' );
			ckbuilder.utils.printUsedTime( time );
		},

		/**
		 * Creates CKEditor build in the specified folder.
		 *
		 * @static
		 */
		generateBuild: function() {
			var time = new Date();
			var startTime = time;
			var config = readConfig();

			validateSourceFolder();
			ckbuilder.tools.prepareTargetFolder( path.resolve( dstDir ) );
			init();
			console.log( "Copying files (relax, this may take a while)" );
			copyFiles( 'build' );
			if ( !ckbuilder.options.all ) {
				filterPluginFolders();
				if ( config.skin ) {
					filterSkinsFolders( config.skin );
				}
			}
			time = ckbuilder.utils.printUsedTime( time );

			console.log( "Merging language files" );
			ckbuilder.lang.mergeAll( sourceLocation, path.join( targetLocation, 'lang' ), pluginNames, config.languages );
			time = ckbuilder.utils.printUsedTime( time );

			var iconsCode = createPluginsSpriteImage();
			console.log( "Building ckeditor.js" );
			var extraCode = '';
			if ( config.skin ) {
				extraCode = "CKEDITOR.config.skin='" + config.skin + "';";
			}
			createCore( config, extraCode + iconsCode, true, 'build' );
			time = ckbuilder.utils.printUsedTime( time );

			console.log( "Building skins" );
			buildSkins();
			if ( targetSkinFile ) {
				ckbuilder.io.deleteFile( targetSkinFile );
			}
			time = ckbuilder.utils.printUsedTime( time );

			ckbuilder.samples.mergeSamples( targetLocation );

			console.log( "Cleaning up target folder" );
			deleteUnusedFiles();
			time = ckbuilder.utils.printUsedTime( time );

			// get information about release directory
			var info = ckbuilder.io.getDirectoryInfo( targetLocation );

			if ( !ckbuilder.options.noZip || !ckbuilder.options.noTar ) {
				console.log( "\nCreating compressed files...\n" );
			}

			var normalize = function( version ) {
				return String( version ).toLowerCase().replace( / /g, "_" ).replace( /\(\)/g, "" );
			};

			var promise = Promise.resolve();
			if ( !ckbuilder.options.noZip ) {
				var zipFile = path.join( path.dirname( targetLocation ), "ckeditor_" + normalize( ckbuilder.options.version ) + ".zip" );
				promise = promise
					.then( function() {
						return ckbuilder.io.zipDirectory( targetLocation, zipFile, "ckeditor" );
					})
					.then( function() {
						var stats = fs.statSync( zipFile );
						console.log( "    Created " + path.basename( zipFile ) + "...: " + stats.size + " bytes (" + Math.round( stats.size / info.size * 100 ) + "% of original)" );
					}).catch( function( error ) {
						console.error( error );
					});
			}
			if ( !ckbuilder.options.noTar ) {
				var tarFile = path.join( path.dirname( targetLocation ), "ckeditor_" + normalize( ckbuilder.options.version ) + ".tar.gz" );
				promise = promise
					.then( function() {
						return ckbuilder.io.targzDirectory( targetLocation, tarFile, "ckeditor" );
					})
					.then( function() {
						var stats = fs.statSync( tarFile );
						console.log( "    Created " + path.basename( tarFile ) + ": " + stats.size + " bytes (" + Math.round( stats.size / info.size * 100 ) + "% of original)" );
					}).catch( function( error ) {
						console.error( error );
					});
			}
			return promise.then( function() {
				ckbuilder.utils.printUsedTime( time );
				console.log( "\n==========================" );
				console.log( "Release process completed:\n" );
				console.log( "    Number of files: " + info.files );
				console.log( "    Total size.....: " + info.size + " bytes" );
				ckbuilder.utils.printUsedTime( startTime );
				console.log( "" );
			});
		}
	};
};

module.exports = builder;
