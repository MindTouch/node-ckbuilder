/*
 Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
 For licensing, see LICENSE.md
 */

"use strict";

const fs = require( "fs-extra" );
const path = require( "path" );
const ckbuilder = {
	io: require( "./io" ),
	javascript: require( "./javascript" ),
	lang: require( "./lang" ),
	tools: require( "./tools" ),
	utils: require( "./utils" ),
	options: require( "./options" )
};

const regexLib = {

	// requires : [ 'dialogui' ]
	requiresArray: new RegExp( '^\\s*requires\\s*:\\s*\\[\\s*(.*?)\\s*\\]', 'm' ),
	requiresString: new RegExp( '^\\s*requires\\s*:\\s*([\'"])\\s*((?:[a-z0-9-_]+|\\s*,\\s*)+?)([\'"])\\s*', 'm' ),

	// lang : 'af,ar,bg'
	langString: new RegExp( '^(\\s*lang\\s*:\\s*)([\'"])(\\s*(?:[a-z-_]+|\\s*,\\s*)+?)(([\'"])\\s*.*$)', 'm' ),

	// matches both CKEDITOR.plugins.add( pluginName AND CKEDITOR.plugins.add( 'pluginName'
	// can be used to detect where "CKEDITOR.plugins.add" is located in code
	pluginsAdd: new RegExp( 'CKEDITOR\\.plugins\\.add\\s*\\(\\s*([\'"]?)([a-zA-Z0-9-_]+)([\'"]?)' ),

	// matches CKEDITOR.plugins.liststyle =
	pluginsDef: new RegExp( 'CKEDITOR\\.plugins\\.[a-z-_0-9]+\\s*=\\s*' ),

	// matches only CKEDITOR.plugins.add( 'pluginName'
	// can be used to find the real plugin name, because the name is not stored in a variable but in a string
	pluginsAddWithStringName: new RegExp( 'CKEDITOR\\.plugins\\.add\\s*\\(\\s*([\'"])([a-zA-Z0-9-_]+)([\'"])' ),
	pluginName: new RegExp( 'var\\s+pluginName\\s*=\\s*([\'"])([a-zA-Z0-9-_]+)([\'"])' ),
	validPluginProps: new RegExp( '(^\\s*icons\\s*:\\s*|^\\s*requires\\s*:\\s*|^\\s*lang\\s*:\\s*|^\\s*$|^\\s*//)', 'm' ),
	blockComments: new RegExp( "/\\*[^\\r\\n]*[\\r\\n]+([\\s\\S]*?)[\\r\\n]+[^\\r\\n]*\\*+/", 'g' )
};

/**
 * Finds the plugin name in given file (plugin.js).
 *
 * @param {java.io.File} file
 * @returns {String|null}
 * @member ckbuilder.plugin
 * @private
 */
function findPluginNameInPluginDefinition( file ) {
	var pluginName;
	var code = ckbuilder.io.readFile( file );

	code = ckbuilder.javascript.removeWhiteSpace( code, path.basename( path.dirname( file ) ) + "/plugin.js" );
	var matcher = regexLib.pluginsAddWithStringName.exec( code );
	if ( matcher !== null ) {
		pluginName = matcher[ 2 ];
	} else {
		matcher = regexLib.pluginName.exec( code );
		if ( matcher !== null ) {
			pluginName = matcher[ 2 ];
		}
	}

	return pluginName;
}

/**
 * Finds the correct plugin.js in given directory.
 *
 * @param {java.io.File} dir
 * @returns {Boolean|String} Path to the right plugin.js file or false.
 * @member ckbuilder.plugin
*/
function findCorrectPluginFile( dir ) {
	var pluginFiles = ckbuilder.utils.findFilesInDirectory( 'plugin.js', dir );
	var result = false;

	if ( pluginFiles.length === 1 ) {
		result = pluginFiles[ 0 ];
	}

	// let's exclude plugin.js located in the _source or dev folders
	else if ( pluginFiles.length > 1 ) {
		var tmpArray = [];
		for ( var i = 0; i < pluginFiles.length; i++ ) {
			if ( !pluginFiles[ i ].match( /(\/|\\)(?:_source|dev)\1/i ) ) {
				tmpArray.push( pluginFiles[ i ] );
			}
		}

		if ( tmpArray.length === 1 ) {
			result = tmpArray[ 0 ];
		}
	}

	return result;
}

/**
 * Handle plugins. Validate them and preprocess.
 *
 * @class
 */
ckbuilder.plugin = {
	/**
	 * Returns an array with plugins required by this plugin.
	 *
	 * @param {java.io.File} file Plugin file
	 * @returns {Array}
	 * @static
	 */
	getRequiredPlugins: function( file ) {
		if ( ckbuilder.options.debug > 1 ) {
			console.log( "Getting required plugins from " + file );
		}

		var text = ckbuilder.io.readFile( file );

		// Remove comments
		text = text.replace( regexLib.blockComments, '' );

		var lines = text.split( "\n" );
		var pluginsAddFound = false;
		var checkValidPluginProps = false;
		var invalidLinesCounter = 0;
		var matcher;

		for ( var i = 0; i < lines.length; i++ ) {
			if ( !pluginsAddFound ) {
				matcher = regexLib.pluginsAdd.exec( lines[ i ] );
				if ( matcher !== null ) {
					pluginsAddFound = true;
				} else {
					matcher = regexLib.pluginsDef.exec( lines[ i ] );
					if ( matcher !== null ) {
						pluginsAddFound = true;
					}
				}
				if ( pluginsAddFound ) {
					invalidLinesCounter = 0;
				}
			}

			var requires;
			if ( pluginsAddFound ) {
				matcher = regexLib.requiresArray.exec( lines[ i ] );
				if ( matcher !== null ) {
					requires = matcher[ 1 ];
					if ( ckbuilder.options.debug > 1 ) {
						console.log( "Found: " + matcher[ 1 ] );
					}
					return requires.replace( /['" ]/g, '' ).split( "," );
				}

				matcher = regexLib.requiresString.exec( lines[ i ] );
				if ( matcher !== null ) {
					requires = matcher[ 2 ];
					if ( ckbuilder.options.debug > 1 ) {
						console.log( "Found: " + matcher[ 2 ] );
					}
					return requires.replace( /['" ]/g, '' ).split( "," );
				}

				if ( checkValidPluginProps ) {
					matcher = regexLib.validPluginProps.exec( lines[ i ] );
					if ( matcher === null ) {
						invalidLinesCounter++;
					}
					if ( invalidLinesCounter > 5 ) {
						pluginsAddFound = false;
						checkValidPluginProps = false;
					}
				}
				// we're in the same line where plugin definition has started, start checking from another line
				else {
					checkValidPluginProps = true;
				}
			}
		}
		return [];
	},

	/**
	 * Updates lang property in file.
	 *
	 * @param {java.io.File} sourceLocation
	 * @param {Object} languages
	 * @returns {Array|Boolean}
	 * @static
	 */
	updateLangProperty: function( sourceLocation, languages ) {
		var text = ckbuilder.io.readFile( sourceLocation );
		var lines = text.split( "\n" );
		var pluginsAddFound = false;
		var checkValidPluginProps = false;
		var langPropertyChanged = false;
		var invalidLinesCounter = 0;
		var validLanguages;

		for ( var i = 0; i < lines.length; i++ ) {
			var matcher;
			if ( !pluginsAddFound ) {
				matcher = regexLib.pluginsAdd.exec( lines[ i ] );

				if ( matcher !== null ) {
					pluginsAddFound = true;
				} else {
					matcher = regexLib.pluginsDef.exec( lines[ i ] );
					if ( matcher !== null ) {
						pluginsAddFound = true;
					}
				}
				if ( pluginsAddFound ) {
					invalidLinesCounter = 0;
				}
			}

			if ( pluginsAddFound ) {
				matcher = regexLib.langString.exec( lines[ i ] );
				if ( matcher !== null ) {
					var pluginLanguages = matcher[ 3 ].replace( /['" ]/g, '' ).split( "," );

					validLanguages = [];

					for ( var langCode in languages ) {
						if ( languages[ langCode ] && pluginLanguages.indexOf( langCode ) !== -1 ) {
							validLanguages.push( langCode );
						}

					}
					// better to change the lang property only if we're able to find some matching language files...
					if ( validLanguages.length ) {
						if ( validLanguages.length !== pluginLanguages.length ) {
							lines[ i ] = matcher[ 1 ] + matcher[ 2 ] + validLanguages.join( ',' ) + matcher[ 4 ];
							langPropertyChanged = true;
						} else {
							return true;
						}

					}
				}
				if ( checkValidPluginProps ) {
					matcher = regexLib.validPluginProps.exec( lines[ i ] );
					if ( matcher === null ) {
						invalidLinesCounter++;
					}

					if ( invalidLinesCounter > 5 ) {
						pluginsAddFound = false;
						checkValidPluginProps = false;
					}
				}
				// We're in the same line where plugin definition has started, start checking from another line.
				else {
					checkValidPluginProps = true;
				}
			}
		}
		if ( langPropertyChanged ) {
			if ( ckbuilder.options.debug > 1 ) {
				console.log( "Updated lang property in " + sourceLocation );
			}

			ckbuilder.io.saveFile( sourceLocation, lines.join( "\r\n" ), true );
			return validLanguages;
		}

		return false;
	},

	/**
	 * Checks specified plugin for errors.
	 *
	 * @param {java.io.File|String} plugin Path to the plugin (or the java.io.File object pointing to a plugin file).
	 * @param {Object=} options
	 * @param {Boolean=} options.exitOnError
	 * @param {String=} options.pluginName
	 * @returns {String}
	 * @static
	 */
	verify: function( plugin, options ) {
		var errors = "";
		var workingDirObj = ckbuilder.io.prepareWorkingDirectoryIfNeeded( plugin );
		var workingDir = workingDirObj.directory;

		if ( ckbuilder.options.debug > 1 ) {
			console.log( "Validating JS files" );
		}

		errors += ckbuilder.tools.validateJavaScriptFiles( workingDir );

		if ( !errors ) {
			var pluginPath = findCorrectPluginFile( workingDir );
			if ( !pluginPath ) {

				// check why findCorrectPluginFile() returned false
				var pluginPaths = ckbuilder.utils.findFilesInDirectory( 'plugin.js', workingDir );
				if ( pluginPaths.length > 1 ) {
					var tmpArray = [];
					var workingDirPath = path.resolve( workingDir );

					for ( var i = 0; i < pluginPaths.length; i++ ) {
						pluginPaths[ i ] = String( pluginPaths[ i ].replace( workingDirPath, '' ) ).replace( /\\/g, '/' );
						if ( !pluginPaths[ i ].match( /(\/|\\)(?:_source|dev)\1/i ) ) {
							tmpArray.push( pluginPaths[ i ] );
						}
					}
					if ( !tmpArray.length ) {
						errors += "Could not find plugin.js:\n" + pluginPaths.join( "\n" ) + "\n";
					} else if ( tmpArray.length > 1 ) {
						errors += "Found more than one plugin.js:\n" + pluginPaths.join( "\n" ) + "\n";
					}
				} else {
					errors += "Unable to locate plugin.js" + "\n";
				}
			} else {
				if ( options && options.pluginName ) {
					var pluginName = findPluginNameInPluginDefinition( path.resolve( pluginPath ) );
					if ( pluginName && pluginName !== options.pluginName ) {
						errors += "The plugin name defined inside plugin.js (" + pluginName + ") does not match the expected plugin name (" + options.pluginName + ")" + "\n";
					}
				}
			}
		}

		workingDirObj.cleanUp();

		if ( errors && options && options.exitOnError ) {
			process.exit( 1 );
		}

		return errors ? errors : "OK";
	},

	/**
	 * Preprocesses the specified plugin and saves in an optimized form in the target folder.
	 *
	 * @param {String} plugin Path to the plugin
	 * @param {String} dstDir Path to the destination folder
	 * @static
	 */
	preprocess: function( plugin, dstDir ) {
		var workingDirObj = ckbuilder.io.prepareWorkingDirectoryIfNeeded( plugin );
		var workingDir = workingDirObj.directory;

		if ( this.verify( workingDir, { exitOnError: false } ) !== "OK" ) {
			workingDirObj.cleanUp();
			throw( "The plugin is invalid" );
		}

		var pluginPath = findCorrectPluginFile( workingDir );
		if ( !pluginPath ) {
			workingDirObj.cleanUp();
			throw( "The plugin file (plugin.js) was not found in " + path.resolve( workingDir ) );
		}

		var pluginFile = path.resolve( pluginPath );
		var targetFolder = path.resolve( dstDir );

		try {
			fs.mkdirSync( targetFolder );
		} catch ( e ) {
			workingDirObj.cleanUp();
			throw( "Unable to create target directory: " + path.resolve( targetFolder ) + "\nError: " + e.message );
		}

		var flags = {};
		var rootFolder = path.dirname( pluginFile );

		ckbuilder.io.copy( rootFolder, targetFolder, function( sourceLocation, targetLocation ) {
				if ( fs.statSync( sourceLocation ).isFile() ) {
					// Manifest file is converted later to a "php.ini" format and saved as manifest.mf
					if ( path.resolve( sourceLocation ) === path.resolve( path.join( rootFolder, "manifest.js" ) ) ) {
						return -1;
					}

					var copied = ckbuilder.tools.fixLineEndings( sourceLocation, targetLocation );
					if ( copied ) {
						// Do not process any directives
						if ( ckbuilder.options.leaveJsUnminified ) {
							return 1;
						}

						var flag = ckbuilder.tools.processDirectives( targetLocation, null, true );
						if ( flag.LEAVE_UNMINIFIED ) {
							flags[ path.resolve( targetLocation ) ] = flag;
						}

						return 1;
					}
				} else {
					if ( !ckbuilder.options.leaveJsUnminified && path.resolve( sourceLocation ) === path.resolve( path.join( rootFolder, "lang" ) ) ) {
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

					// remove @license information from files that will go into ckeditor.js (plugin.js)
					if ( targetPath === path.resolve( path.join( targetFolder, "plugin.js" ) ) ) {
						if ( ckbuilder.options.debug > 2 ) {
							console.log( "Removing license information from " + targetPath );
						}
						ckbuilder.io.saveFile( targetLocation, ckbuilder.tools.removeLicenseInstruction( ckbuilder.io.readFile( targetLocation ) ), true );
					}

					if ( ckbuilder.options.debug ) {
						console.log( "Minifying: " + targetLocation );
					}

					ckbuilder.javascript.minify( targetLocation );
				}
			} );

		var langFolder = path.join( rootFolder, "lang" );
		var targetLangFolder = path.join( targetFolder, "lang" );
		if ( !ckbuilder.options.leaveJsUnminified && ckbuilder.io.exists( langFolder ) ) {
			fs.mkdirSync( targetLangFolder );
			var translations = {};
			console.log( "Processing lang folder" );
			translations.en = ckbuilder.lang.loadLanguageFile( path.join( langFolder, "en.js" ) ).translation;
			var children = fs.readdirSync( langFolder );
			for ( var i = 0; i < children.length; i++ ) {
				var langFile = children[ i ].match( /^([a-z]{2}(?:-[a-z]+)?)\.js$/ );
				if ( langFile ) {
					var langCode = langFile[ 1 ];
					translations[ langCode ] = ckbuilder.utils.merge( translations.en, ckbuilder.lang.loadLanguageFile( path.join( langFolder, children[ i ] ) ).translation );
					var pseudoObject = JSON.stringify( translations[ langCode ] ).replace( /^\{(.*)\}$/, '$1' );
					ckbuilder.io.saveFile( path.join( targetLangFolder, children[ i ] ), pseudoObject, true );
				}
			}
		}

		workingDirObj.cleanUp();
	}
};

module.exports = ckbuilder.plugin;
