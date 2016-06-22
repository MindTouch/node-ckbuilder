/*
 Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
 For licensing, see LICENSE.md
 */

"use strict";

var fs = require( "fs-extra" );
var path = require( "path" );
var ckbuilder = {
	io: require( "./io" ),
	javascript: require( "./javascript" ),
	css: require( "./css" ),
	image: require( "./image" ),
	tools: require( "./tools" ),
	utils: require( "./utils" ),
	options: require( "./options" )
};

var regexLib = {
	skinName: new RegExp( 'CKEDITOR\\.skin\\.name\\s*\\=\\s*([\'"])([a-zA-Z0-9-_]+)([\'"])' )
};

/**
 * Finds the skin name in give file (skin.js).
 *
 * @param {java.io.File} file
 * @returns {String|null}
 * @private
 * @member ckbuilder.skin
 */
function findSkinNameInSkinDefinition( file ) {
	var code = ckbuilder.io.readFile( file );

	code = ckbuilder.javascript.removeWhiteSpace( code, path.basename( path.dirname( file ) ) + "/skin.js" );
	var matcher = regexLib.skinName.exec( code );
	var skinName;
	if ( matcher !== null ) {
		skinName = matcher[ 2 ];
	}

	return skinName;
}

/**
 * Finds the correct skin.js in given directory.
 *
 * @param {java.io.File} dir
 * @returns {Boolean|String} Path to the right skin.js file or false.
 * @member ckbuilder.skin
 */
function findCorrectSkinFile( dir ) {
	var skinFiles = ckbuilder.utils.findFilesInDirectory( 'skin.js', dir );

	if ( !skinFiles.length ) {
		return false;
	}
	if ( skinFiles.length === 1 ) {
		return skinFiles[ 0 ];
	}

	// let's exclude skin.js located in the _source folder
	if ( skinFiles.length > 1 ) {
		var tmpArray = [];
		for ( var i = 0; i < skinFiles.length; i++ ) {
			if ( !skinFiles[ i ].match( /(\/|\\)_source\1/ ) ) {
				tmpArray.push( skinFiles[ i ] );
			}
		}
		if ( !tmpArray.length ) {
			return false;
		} else if ( tmpArray.length > 1 ) {
			return false;
		} else {
			return tmpArray[ 0 ];
		}
	}
}

/**
 * Handle skins. Validate them and preprocess.
 *
 * @class
 */
ckbuilder.skin = {
	/**
	 * Checks specified skin for errors.
	 *
	 * @param {String} skin
	 * @param {Object} options
	 * @param {String=} options.skinName
	 * @param {Boolean=} options.exitOnError
	 * @static
	 */
	verify: function( skin, options ) {
		var skinPath;
		var errors = '';
		var workingDirObj = ckbuilder.io.prepareWorkingDirectoryIfNeeded( skin );
		var workingDir = workingDirObj.directory;

		if ( ckbuilder.options.debug > 1 ) {
			console.log( "Validating JS files" );
		}

		errors += ckbuilder.tools.validateJavaScriptFiles( workingDir );

		if ( !errors ) {
			skinPath = findCorrectSkinFile( workingDir );
			if ( !skinPath ) {

				// check why findCorrectSkinFile() returned false
				var skinPaths = ckbuilder.utils.findFilesInDirectory( 'skin.js', workingDir );
				if ( skinPaths.length > 1 ) {
					var tmpArray = [];
					var workingDirPath = path.resolve( workingDir );
					for ( var i = 0; i < skinPaths.length; i++ ) {
						skinPaths[ i ] = String( skinPaths[ i ].replace( workingDirPath, '' ) ).replace( /\\/g, '/' );
						if ( !skinPaths[ i ].match( /(\/|\\)_source\1/ ) ) {
							tmpArray.push( skinPaths[ i ] );
						}
					}
					if ( !tmpArray.length ) {
						errors += "Found more than one skin.js:\n" + skinPaths.join( "\n" ) + "\n";
					} else if ( tmpArray.length > 1 ) {
						errors += "Found more than one skin.js:\n" + skinPaths.join( "\n" ) + "\n";
					}
				} else {
					errors += "Unable to locate skin.js";
				}
			} else {
				if ( options && options.skinName ) {
					var skinName = findSkinNameInSkinDefinition( path.resolve( skinPath ) );
					if ( skinName && skinName !== options.skinName ) {
						errors += "The skin name defined inside skin.js (" + skinName + ") does not match the expected skin name (" + options.skinName + ")" + "\n";
					}
				}
			}
		}

		if ( skinPath ) {
			var skinFile = path.resolve( skinPath );
			var iconsFolder = path.join( path.dirname( skinFile ), 'icons' );

			// Skin is not obliged to provide icons
			if ( ckbuilder.io.exists( iconsFolder ) && !fs.statSync( iconsFolder ).isDirectory() ) {
				errors += "There is an \"icons\" file, but a folder with this name is expected." + "\n";
			}
		}

		workingDirObj.cleanUp();

		if ( errors && options && options.exitOnError ) {
			process.exit( 1 );
		}

		return errors ? errors : "OK";
	},

	/**
	 * Builds the specified skin and saves in an optimized form in the target folder.
	 *
	 * @param {String} skin Path to the skin
	 * @param {String} dstDir Path to the destination folder
	 * @static
	 */
	build: function( skin, dstDir ) {
		var time = new Date();
		var startTime = time;
		var skinLocation = path.resolve( dstDir );

		ckbuilder.tools.prepareTargetFolder( skinLocation );

		console.log( "Building skin: " + skin );
		this.preprocess( skin, dstDir, true );

		var iconsDir = path.join( skinLocation, "icons" );
		if ( ckbuilder.io.exists( iconsDir ) ) {
			ckbuilder.io.deleteDirectory( path.join( skinLocation, "icons" ) );
		}

		ckbuilder.utils.printUsedTime( startTime );
	},

	/**
	 * Preprocesses the specified skin and saves in an optimized form in the target folder.
	 *
	 * @param {String} skin Path to the skin
	 * @param {String} dstDir Path to the destination folder
	 * @param {Boolean=} generateSprite Whether to generate strip image from available icons
	 * @static
	 */
	preprocess: function( skin, dstDir, generateSprite ) {
		var workingDirObj = ckbuilder.io.prepareWorkingDirectoryIfNeeded( skin );
		var workingDir = workingDirObj.directory;

		if ( !this.verify( workingDir, { exitOnError: false } ) ) {
			workingDirObj.cleanUp();
			throw( "The skin is invalid" );
		}

		var skinPath = findCorrectSkinFile( workingDir );
		if ( !skinPath ) {
			workingDirObj.cleanUp();
			throw( "The skin file (skin.js) was not found in " + path.resolve( workingDir ) );
		}

		var skinFile = path.resolve( skinPath );
		var name = findSkinNameInSkinDefinition( skinFile );
		if ( !name ) {
			workingDirObj.cleanUp();
			throw( "Unable to find skin name" );
		}
		var targetFolder = path.resolve( dstDir );
		var flags = {};
		var rootFolder = path.dirname( skinFile );
		ckbuilder.io.copy( rootFolder, targetFolder, function( sourceLocation, targetLocation ) {
				if ( fs.statSync( sourceLocation ).isFile() ) {
					var copied = ckbuilder.tools.fixLineEndings( sourceLocation, targetLocation );
					if ( copied ) {

						// Do not process any directives
						if ( ckbuilder.options.leaveJsUnminified ) {
							return 1;
						}

						var flag = ckbuilder.tools.processDirectives( targetLocation, null, true );
						if ( flag.LEAVE_UNMINIFIED ) {
							flags[ targetLocation ] = flag;
						}

						return 1;
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
							console.log( "Leaving unminified: " + path.resolve( targetLocation ) );
						}

						ckbuilder.io.saveFile( targetLocation, ckbuilder.tools.removeLicenseInstruction( ckbuilder.io.readFile( targetLocation ) ), true );
						return;
					}

					if ( ckbuilder.options.debug ) {
						console.log( "Minifying: " + targetLocation );
					}

					ckbuilder.javascript.minify( targetLocation );
				}
			} );

		if ( generateSprite ) {
			var skinIcons = ckbuilder.image.findIcons( targetFolder );
			var files = [];
			var outputFile = path.resolve( targetFolder, "icons.png" );
			var outputCssFile = path.resolve( targetFolder, "editor.css" );
			var noIcons = true;
			var buttonName;

			// Sorted by plugin name
			for ( buttonName in skinIcons ) {
				files.push( path.resolve( skinIcons[ buttonName ] ) );
				noIcons = false;
			}

			if ( !noIcons ) {
				ckbuilder.image.createSprite( files, outputFile, outputCssFile );
			}

			// HiDPI support, set some variables again
			skinIcons = ckbuilder.image.findIcons( targetFolder, true );
			files = [];
			outputFile = path.resolve( targetFolder, "icons_hidpi.png" );
			noIcons = true;

			// Sorted by plugin name
			for ( buttonName in skinIcons ) {
				files.push( path.resolve( skinIcons[ buttonName ] ) );
				noIcons = false;
			}

			if ( !noIcons ) {
				ckbuilder.image.createSprite( files, outputFile, outputCssFile, true );
			}
		}

		if ( !ckbuilder.options.leaveCssUnminified ) {
			ckbuilder.css.mergeCssFiles( targetFolder );
		}

		workingDirObj.cleanUp();
	}
};

module.exports = ckbuilder.skin;
