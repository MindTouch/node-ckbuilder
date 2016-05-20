/*
 Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
 For licensing, see LICENSE.md
 */

"use strict";

const fs = require( "fs-extra" );
const os = require( "os" );
const path = require( "path" );
const archiver = require( "archiver" );
const AdmZip = require( "adm-zip" );
const ckbuilder = {
	options: require( "./options" )
}

const BOM_CHAR_CODE = 65279;
const BOM = String.fromCharCode( BOM_CHAR_CODE );

/**
 * Creates an archive from specified path.
 *
 * @param {String} sourceLocation Path Source path
 * @param {java.io.OutputStream} outStream Output stream to which the archive is created
 * @param {String} compressMethod The type of the archive (tar.gz|zip)
 * @param {String} rootDir The root folder of the archive.
 */
function compressDirectory( sourceLocation, outStream, compressMethod, rootDir, cb ) {
	if ( ckbuilder.options.debug ) {
		console.log( '    ' + compressMethod + ': ' + path.resolve( sourceLocation ) );
	}
	if ( !rootDir ) {
		rootDir = '';
	}
	if ( !( compressMethod in { zip: 1, tar: 1 } ) ) {
		throw 'Unknown compression method: ' + compressMethod;
	}
    const output = fs.createWriteStream( outStream );
    const archive = archiver( compressMethod );
    output.on( 'close', () => {
    	if ( typeof cb === 'function' ) {
    		cb();
    	}
    });
    archive.on( 'error', ( e ) => {
        console.error( 'An error occurred during (' + compressMethod + ') compression of ' + path.resolve( sourceLocation ) + ': ' + e );
        throw e;
    });
    archive.pipe( output );
    archive.directory( sourceLocation, rootDir );
    archive.finalize();
}

/**
 * Copy file from source to target location.
 *
 * @param {String} sourceLocation Source folder
 * @param {String} targetLocation Target folder
 */
function copyFile( sourceLocation, targetLocation ) {
	try {
		if ( ckbuilder.options.debug > 1 ) {
			console.log( "Copying file: " + path.resolve( sourceLocation ) );
		}
		fs.copySync( sourceLocation, targetLocation );
		if ( ckbuilder.options.debug > 1 ) {
			console.log( "File copied: " + path.resolve( targetLocation ) );
		}
	} catch ( e ) {
		throw "Cannot copy file:\n Source: " + path.resolve( sourceLocation ) + "\n Destination : " + path.resolve( targetLocation ) + "\n" + e.message;
	}
}

function walkDirectory ( dir, callback ) {
	const files = fs.readdirSync( dir );
	files.forEach( ( file ) => {
		file = path.resolve( dir, file );
		if ( fs.statSync( file ).isDirectory() ) {
			walkDirectory( file, callback );
		}
		else {
			if ( typeof callback === "function" ) {
				callback( file );
			}
		}
	});
};

/**
 * Input output actions. Copy, delete files and directories. Save them, show directory info.
 *
 * @class
 */
ckbuilder.io = {
	/**
	 * This method is preventable depending on callback value.
	 * When callback returns false value then nothing changes.
	 *
	 * @static
	 * @param {java.io.File} sourceLocation
	 * @param {java.io.File} targetLocation
	 * @param {function(java.io.File, java.io.File):Boolean} callback
	 */
	copyFile: function( sourceLocation, targetLocation, callback ) {
		if ( callback ) {
			if ( !callback.call( this, sourceLocation, targetLocation ) ) {
				return;
			}
		}
		copyFile( sourceLocation, targetLocation );
	},

	/**
	 * Unzips a file recursively.
	 *
	 * @param {String} zipFile Path to the source file
	 * @param {String|java.io.File} newPath Path to the destination folder
	 * @static
	 */
	unzipFile: function( zipFile, newPath ) {
		try {
			const zip = new AdmZip( zipFile );
			zip.extractAllTo( newPath );
		} catch ( e ) {
			throw "Unable to extract archive file:\n Source: " + zipFile + "\n" + e.message;
		}
		walkDirectory( newPath, ( file ) => {
			if ( file.endsWith( ".zip" ) ) {
				ckbuilder.io.unzipFile( file, newPath );
			}
		} );
	},

	/**
	 * Deletes a directory.
	 *
	 * @param {java.io.File} path Directory to delete
	 * @static
	 */
	deleteDirectory: function( dir ) {
		try {
			fs.removeSync( dir );
		} catch ( e ) {
			if ( ckbuilder.options.debug > 1 ) {
				console.log( "Error: " + e.message );
			}
			throw "Cannot delete directory: " + dir;
		}
	},

	/**
	 * Deletes a file.
	 *
	 * @param {java.io.File} path File to delete
	 * @static
	 */
	deleteFile: function( filePath ) {
		try {
			fs.removeSync( filePath );
		} catch ( e ) {
			if ( ckbuilder.options.debug > 1 ) {
				console.log( "Error: " + e.message );
			}
			throw "Cannot delete file: " + path.resolve( filePath );
		}
	},

	/**
	 * Saves a file.
	 *
	 * @param {java.io.File} file Path to the file
	 * @param {String} text Content of a file
	 * @param {Boolean} [includeBom=false] includeBom Whether to include BOM character
	 * @static
	 */
	saveFile: function( file, text, includeBom ) {
		includeBom = ( includeBom === true );
		if ( includeBom === true ) {
			text = BOM + text;
		}

		try {
			fs.writeFileSync( file, text, "utf-8" );
		} catch ( e ) {
			throw "Cannot save file:\n Path: " + path.resolve( file ) + "\n Exception details: " + e.message;
		}
	},

	/**
	 * Copies file/folder, with the possibility of ignoring specific paths.
	 *
	 * @param {java.io.File} sourceLocation Source location
	 * @param {java.io.File} targetLocation Target location
	 * @param {function(java.io.File, java.io.File): number} callbackBefore (Optional)
	 *   The possible returned values are:
	 *
	 *   -1 Do not copy file, do not call callbackAfter.
	 *
	 *   0 Copy file, call callbackAfter.
	 *
	 *   1 File was already copied, call callbackAfter.
	 * @param {Function} callbackAfter (Optional) Callback function executed after the file is copied.
	 * @static
	 */
	copy: function( sourceLocation, targetLocation, callbackBefore, callbackAfter ) {
		if ( callbackBefore ) {
			const code = callbackBefore.call( this, sourceLocation, targetLocation );
			if ( code === -1 ) {
				return;
			}
			if ( callbackAfter ) {
				callbackAfter.call( this, targetLocation );
			}
			if ( code === 1 ) {
				return;
			}
		}

		if ( fs.statSync( sourceLocation ).isDirectory() ) {
			fs.ensureDirSync( targetLocation );
			const children = fs.readdirSync( sourceLocation );
			for ( let i = 0; i < children.length; i++ ) {
				if ( children[ i ] === ".svn" || children[ i ] === "CVS" || children[ i ] === ".git" ) {
					continue;
				}
				ckbuilder.io.copy( path.join( sourceLocation, children[ i ] ), path.join( targetLocation, children[ i ] ), callbackBefore, callbackAfter );
			}
			const list = fs.readdirSync( targetLocation );
			if ( !list.length ) {
				ckbuilder.io.deleteDirectory( targetLocation );
			}
		} else {
			copyFile( sourceLocation, targetLocation );
			if ( callbackAfter ) {
				callbackAfter.call( this, targetLocation );
			}
		}
	},

	/**
	 * Creates a zip archive from specified location.
	 *
	 * @param {java.io.File} sourceLocation The location of the folder to compress.
	 * @param {java.io.File} targetFile The location of the target zip file.
	 * @param {String} rootDir The name of root folder in which the rest of files will be placed
	 * @static
	 */
	zipDirectory: function( sourceLocation, targetFile, rootDir ) {
		compressDirectory( sourceLocation, targetFile, 'zip', rootDir );
	},

	/**
	 * Creates a tar.gz archive from specified location.
	 *
	 * @param {java.io.File} sourceLocation The location of the folder to compress.
	 * @param {java.io.File} targetFile The location of the target tar.gz file.
	 * @param {String} rootDir The name of root folder in which the rest of files will be placed
	 * @static
	 */
	targzDirectory: function( sourceLocation, targetFile, rootDir ) {
		compressDirectory( sourceLocation, targetFile, 'tar', rootDir );
	},

	/**
	 * Sets or removes the BOM character at the beginning of the file.
	 *
	 * @param {String} file Path to the file
	 * @param {Boolean} includeUtf8Bom Boolean value indicating whether the BOM character should exist
	 * @static
	 */
	setByteOrderMark: function( file, includeUtf8Bom ) {
		let data = "";
		try {
			data = fs.readFileSync( file, 'utf-8' );

			/* BOM is at the beginning of file */
			if ( data.length && data.charCodeAt( 0 ) === BOM_CHAR_CODE ) {
				if ( !includeUtf8Bom ) {
					if ( ckbuilder.options.debug ) {
						console.log( 'Removing BOM from ' + path.resolve( file ) );
					}
					ckbuilder.io.saveFile( file, ckbuilder.io.readFile( file ) );
				}
			} else {
				if ( includeUtf8Bom ) {
					if ( ckbuilder.options.debug ) {
						console.log( 'Adding BOM to ' + path.resolve( file ) );
					}
					ckbuilder.io.saveFile( file, ckbuilder.io.readFile( file ), true );
				}
			}
		} catch ( e ) {
			throw 'An I/O error occurred while reading the ' + path.resolve( file ) + ' file.';
		}
	},

	/**
	 * Reads files from given array and returns joined file contents.
	 *
	 * @param {java.io.File[]} files The list of files to read.
	 * @returns {String}
	 * @static
	 */
	readFiles: function( files, separator ) {
		let out = [];

		for ( let i = 0; i < files.length; i++ ) {
			out.push( ckbuilder.io.readFile( files[ i ] ) );
		}

		return out.join( separator ? separator : "" );
	},

	/**
	 * Reads file and returns file contents without initial UTF-8 Byte Order.
	 *
	 * Mark
	 * @param {java.io.File} file
	 * @returns {String}
	 * @static
	 */
	readFile: function( file ) {
		let data;
		try {
			data = fs.readFileSync( file, 'utf-8' );
		} catch ( e ) {
			throw 'An I/O error occurred while reading the ' + path.resolve( file ) + ' file.';
		}
		if ( data.length && data.charCodeAt( 0 ) === BOM_CHAR_CODE ) {
			data = data.substring( 1 );
		}

		return data;
	},

	/**
	 * Returns size and number of files in the specified directory.
	 *
	 * @param {String} path Path to the folder
	 * @returns {{files: Number, size: Number}}
	 * @static
	 */
	getDirectoryInfo: function( dir ) {
		let result = {
				files: 0,
				size: 0
			};

		if ( !ckbuilder.io.exists( dir ) ) {
			return result;
		}

		const files = fs.readdirSync( dir );

		if ( !files.length ) {
			return result;
		}

		for ( let i = 0; i < files.length; i++ ) {
			let stats;
			try {
				stats = fs.statSync( files[ i ] );
			} catch ( e ) {
				continue;
			}
			if ( stats.isFile() ) {
				result.size += stats[ 'size' ];
				result.files++;
			} else {
				const info = ckbuilder.io.getDirectoryInfo( files[ i ] );
				result.size += info.size;
				result.files += info.files;
			}
		}

		return result;
	},

	/**
	 * Returns the (lower-cased) extension of the file from the specified path (e.g. "txt").
	 *
	 * @param {String} fileName The file name
	 * @returns {String}
	 * @static
	 */
	getExtension: function( fileName ) {
		var pos = fileName.lastIndexOf( '.' );

		if ( pos === -1 ) {
			return '';
		} else {
			return String( fileName.substring( pos + 1 ).toLowerCase() );
		}
	},

	/**
	 * Check element wether its a zip file. If yes, then extract it into temporary directory.
	 *
	 * @param {java.io.File|String} element Directory or zip file.
	 * @returns {java.io.File} Directory on which work will be done.
	 */
	prepareWorkingDirectoryIfNeeded: function( element ) {
		const elementLocation = path.resolve( element );
		let tmpDir;
		let workingDir;
		let isTemporary = false;
		if ( !fs.statSync( elementLocation ).isDirectory() ) {
			if ( ckbuilder.io.getExtension( elementLocation ) !== "zip" ) {
				throw( "The element file is not a zip file: " + elementLocation );
			}

			// temporary directory
			tmpDir = path.join( os.tmpdir(), ".tmp" + Math.floor( ( Math.random() * 1000000 ) + 1 ) );

			// cleaning up dir
			try {
				fs.emptyDirSync( tmpDir );
			} catch ( e ) {
				throw( "Unable to create or empty temp directory: " + tmpDir + "\nError: " + e.message );
			}

			// unzip into temp directory
			ckbuilder.io.unzipFile( element, tmpDir );
			isTemporary = true;
			workingDir = tmpDir;
		} else {
			workingDir = elementLocation;
		}

		return {
			directory: workingDir,
			cleanUp: function () {
				if ( isTemporary ) {
					ckbuilder.io.deleteDirectory( workingDir );
				}
			}
		};
	},

	exists: function( path ) {
		try {
			const stats = fs.statSync( path );
			return true;
		} catch ( e ) {
			return false;
		}
	}
};

module.exports = ckbuilder.io;
