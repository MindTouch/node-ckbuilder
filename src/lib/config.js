/*
 Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
 For licensing, see LICENSE.md
 */

"use strict";

const fs = require( "fs-extra" );
const path = require( "path" );
const vm = require( "vm" );
const ckbuilder = {
	io: require( "./io" ),
	tools: require( "./tools" ),
	utils: require( "./utils" ),
	options: require( "./options" ),
	error: require( "./error" )
};

/**
 * Looking through directory and search subdirectories.
 * When second parameter provided also filter subdirectories which contains file provided in parameter.
 *
 * @param {java.io.File} rootDir
 * @param {String=} requiredFile If parameter provided also check whether directory contains file
 * @returns {Object} Hash map of 1
 * @member CKBuilder.config
 */
function getSubfolders( rootDir, requiredFile ) {
	if ( !ckbuilder.io.exists( rootDir ) || !fs.statSync( rootDir ).isDirectory() ) {
		return {};
	}

	var children = fs.readdirSync( rootDir ); // get directory children
	var result = {};

	children.sort();
	for ( var i = 0; i < children.length; i++ ) {
		var childDir = path.join( rootDir, children[ i ] );

		if ( !requiredFile || ckbuilder.io.exists( path.join( childDir, requiredFile ) ) ) {
			result[ children[ i ] ] = 1;
		}
	}

	return result;
}

/**
 * Responsible for creating CKBuilder config based on source directory
 *
 * @class
 */
ckbuilder.config = {
	/**
	 * Creates a configuration file (build-config.js) with all plugins and skins listed.
	 * Config file structure is based on `plugins` and `skins` catalogue content.
	 *
	 * @param {String} sourceDir Path to the folder with source files
	 * @static
	 */
	create: function( sourceDir ) {
		var sourceLocation = path.resolve( sourceDir );

		if ( !ckbuilder.io.exists( sourceLocation ) ) {
			ckbuilder.error( "Source folder does not exist: " + sourceDir );
		}
		if ( !fs.statSync( sourceLocation ).isDirectory() ) {
			ckbuilder.error( "Source folder is not a directory: " + sourceDir );
		}

		var plugins = getSubfolders( path.join( sourceLocation, "plugins" ), "plugin.js" );
		var skins = getSubfolders( path.join( sourceLocation, "skins" ), "skin.js" );
		var config = {
			skins: skins,
			plugins: plugins
		};

		ckbuilder.io.saveFile( ckbuilder.options.buildConfig || 'build-config.js', "var CKBUILDER_CONFIG = {\n" + ckbuilder.utils.prettyPrintObject( config, "	" ) + "\n};" );
	},

	/**
	 * Reads a configuration file and returns the configuration object.
	 *
	 * @param {java.io.File} configFile Path to the configuration file
	 * @static
	 */
	read: function( configFile ) {
		var file = path.resolve( configFile );
		var code = ckbuilder.io.readFile( file );
		var script = new vm.Script( code, { filename: file } );
		var scope = {};
		vm.createContext( scope );

		try {
			script.runInContext( scope );
			return scope.CKBUILDER_CONFIG;
		} catch ( e ) {
			throw( "Configuration file is invalid: " + file + ".\nError: " + e.message );
		}
	},

	/**
	 * Returns true if the file/folder is set to be ignored.
	 *
	 * @param {java.io.File} sourceLocation
	 * @param {Array} ignoredPaths An array with ignored paths
	 * @returns {Boolean}
	 * @static
	 */
	isIgnoredPath: function( sourceLocation, ignoredPaths ) {
		if ( !ignoredPaths ) {
			return false;
		}

		for ( var i = 0; i < ignoredPaths.length; i++ ) {
			var rule = ignoredPaths[ i ];

			if ( rule.indexOf( '/' ) === -1 ) {
				if ( path.basename( sourceLocation ) === rule ) {
					return true;
				}
			} else if ( path.resolve( sourceLocation ).replace( "\\", "/" ).endsWith( rule ) ) {
				return true;
			}
		}

		return false;
	}
};

module.exports = ckbuilder.config;
