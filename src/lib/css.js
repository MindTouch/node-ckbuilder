/*
 Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
 For licensing, see LICENSE.md
 */

"use strict";

const fs = require( "fs-extra" );
const path = require( "path" );
const cssmin = require( "./cssmin" );
const ckbuilder = {
	io: require( "./io" ),
	tools: require( "./tools" ),
	options: require( "./options" )
};

var importedFiles = {};

/**
 * Removes comments from specified text.
 *
 * @param {String} text
 * @returns {String}
 * @member ckbuilder.css
 * @private
 */
function removeComments( text ) {
	var endIndex;
	var startIndex = 0;

	/**
	 * Indicating comment to hide rules from IE Mac.
	 *
	 * @property {Boolean} iemac
	 * @private
	 * @member ckbuilder.css
	 */
	var iemac = false;
	var preserve = false;
	var deleteSubstring = function( str, start, end ) {
		return str.substring( 0, start ) + str.substring( end, str.length );
	};

	while ( ( startIndex = text.indexOf( "/*", startIndex ) ) >= 0 ) {
		preserve = text.length > startIndex + 2 && text.charAt( startIndex + 2 ) === '!';
		endIndex = text.indexOf( "*/", startIndex + 2 );
		if ( endIndex < 0 ) {
			if ( !preserve ) {
				text = deleteSubstring( text, startIndex, text.length );
			}
		} else if ( endIndex >= startIndex + 2 ) {
			if ( text.charAt( endIndex - 1 ) === '\\' ) {
				/*
				 * Looks like a comment to hide rules from IE Mac.
				 * Leave this comment, and the following one, alone...
				 */
				startIndex = endIndex + 2;
				iemac = true;
			} else if ( iemac ) {
				startIndex = endIndex + 2;
				iemac = false;
			} else if ( !preserve ) {
				try {
					/* Remove new line character if there is nothing else after a comment */
					if ( text.charCodeAt( endIndex + 2 ) === 13 && text.charCodeAt( endIndex + 3 ) === 10 ) {
						endIndex += 2;
					} else if ( text.charCodeAt( endIndex + 2 ) === 10 && text.charCodeAt( endIndex + 3 ) === 13 ) {
						endIndex += 2;
					} else if ( text.charCodeAt( endIndex + 2 ) === 13 && text.charCodeAt( endIndex + 3 ) === 13 ) {
						endIndex += 1;
					} else if ( text.charCodeAt( endIndex + 2 ) === 10 && text.charCodeAt( endIndex + 3 ) === 10 ) {
						endIndex += 1;
					}
				} catch ( e ) {
					/* catch StringIndexOutOfBoundsException if comment is at the end of file */
				}

				text = deleteSubstring( text, startIndex, endIndex + 2 );
			} else {
				startIndex = endIndex + 2;
			}
		}
	}

	return text;
}

/**
 * Returns content of source file and all CSS files included in import statements.
 *
 * @param {java.io.File} sourceLocation The location of CSS file
 * @param {java.io.File=} parentLocation The location of parent CSS file, if source file was imported
 * @returns {String}
 * @member ckbuilder.css
 * @private
 */
function processCssFile( sourceLocation, parentLocation ) {
	var out = [];
	var isImported = false;
	var parentPath;
	var sourcePath = path.resolve( sourceLocation );
	var lines = ckbuilder.io.readFile( sourcePath ).split( /\r\n|\n|\r/ );

	if ( !parentLocation ) {
		parentLocation = sourceLocation;
		parentPath = path.resolve( sourceLocation );
	} else {
		isImported = true;
		parentPath = path.resolve( parentLocation );
		if ( sourcePath === parentPath ) {
			throw( "Invalid @import statements, file including itself: " + sourcePath );
		}

		if ( importedFiles[ parentPath ][ sourcePath ] ) {
			throw( "Invalid @import statement in " + parentPath + ", file " + sourcePath + " was already imported." );
		}

		importedFiles[ parentPath ][ sourcePath ] = true;
	}

	for ( var i = 0, length = lines.length; i < length; i++ ) {
		if ( lines[ i ].indexOf( "@import" ) === -1 ) {
			out.push( lines[ i ] );
		} else {
			var matches = lines[ i ].match( /^\s*@import\s+url\(["'](.*?)["']\)/ );

			if ( matches[ 1 ] ) {
				var file = path.join( path.dirname( sourceLocation ), matches[ 1 ] );
				if ( !ckbuilder.io.exists( file ) ) {
					throw( "Importing of CSS file failed, file does not exist (" + file + ")" );
				} else {
					if ( !importedFiles[ parentPath ] ) {
						importedFiles[ parentPath ] = {};
					}

					out.push( processCssFile( file, parentLocation ) );
				}
			} else {
				out.push( lines[ i ] );
			}
		}
	}

	if ( isImported ) {
		return removeComments( out.join( "\r\n" ) );
	} else {
		return out.join( "\r\n" ).replace( /(\r\n){2,}/g, "\r\n" );
	}
}

/**
 * Copies files from source to the target folder and calls the CSS processor on each css file.
 *
 * @param {java.io.File} targetLocation Target folder
 * @member ckbuilder.css
 * @private
 */
function processCssFiles( targetLocation ) {
	var children = fs.readdirSync( targetLocation );
	for ( var i = 0; i < children.length; i++ ) {
		var f = path.resolve( targetLocation, children[ i ] );
		if ( fs.statSync( f ).isDirectory() ) {
			processCssFiles( f );
		} else if ( f.toLowerCase().endsWith( ".css" ) ) {
			ckbuilder.io.saveFile( f, processCssFile( f ) );
			if ( ckbuilder.options.debug ) {
				console.log( "    Saved CSS file: " + f );
			}
		}
	}
}

/**
 * Compress all CSS files in given directory.
 *
 * @param {java.io.File} targetLocation
 * @member ckbuilder.css
 * @private
 */
function compressCssFiles( targetLocation ) {
	var children = fs.readdirSync( targetLocation );
	for ( var i = 0; i < children.length; i++ ) {
		var f = path.resolve( targetLocation, children[ i ] );
		if ( fs.statSync( f ).isDirectory() ) {
			compressCssFiles( f );
		} else if ( f.toLowerCase().endsWith( ".css" ) ) {
			if ( ckbuilder.options.debug ) {
				console.log( "Compressing " + f );
			}

			var cssContent = ckbuilder.io.readFile( f );
			var copyright = ckbuilder.tools.getCopyrightFromText( cssContent );

			cssContent = cssmin( cssContent, -1 );
			ckbuilder.io.saveFile( f, copyright + cssContent );
		}
	}
}

/**
 * Removes imported CSS files.
 *
 * @param {Object} importedFiles
 * @member ckbuilder.css
 * @private
 */
function deleteImportedFiles( importedFiles ) {
	for ( var parentPath in importedFiles ) {
		for ( var filePath in importedFiles[ parentPath ] ) {
			if ( !importedFiles[ filePath ] ) {
				var file = path.resolve( filePath );
				var fileName = path.basename( file );

				if ( fileName === "dialog.css" || fileName === "editor.css" ) {
					continue;
				}

				if ( ckbuilder.options.debug > 1 ) {
					console.log( "    CSS file was imported, removing: " + filePath );
				}

				ckbuilder.io.deleteFile( filePath );
			} else {
				if ( ckbuilder.options.debug > 1 ) {
					console.log( "    CSS file was imported, but is also a root CSS file for another file: " + filePath );
				}
			}
		}
	}
}

/**
 * Handle css files - merge then, and determine dependencies.
 *
 * @class
 */
ckbuilder.css = {
	/**
	 * Performs optimization of CSS files in given location.
	 * Join @import files into root CSS file.
	 *
	 * @param {java.io.File} targetLocation The folder where to optimize CSS files.
	 * @static
	 */
	mergeCssFiles: function( targetLocation ) {
		if ( !fs.statSync( targetLocation ).isDirectory() ) {
			throw( "CSS compression failed. The target location is not a directory: " + path.resolve( targetLocation ) );
		}

		importedFiles = {};
		processCssFiles( targetLocation );
		deleteImportedFiles( importedFiles );
		if ( !ckbuilder.options.leaveCssUnminified ) {
			compressCssFiles( targetLocation );
		}
	}
};

module.exports = ckbuilder.css;
