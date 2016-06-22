/*
 Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
 For licensing, see LICENSE.md
 */

'use strict';

var argv = require( "yargs" )
	.alias( "d", "debug-level" )
	.alias( "s", "skip-omitted-in-build-config" )
	.argv;

var now = new Date();
var timestamp = parseInt( now.getUTCFullYear() % 1000, 10 ).toString( 36 ) + parseInt( now.getUTCMonth(), 10 ).toString( 36 ) + parseInt( now.getUTCDate(), 10 ).toString( 36 ) + parseInt( now.getUTCHours(), 10 ).toString( 36 );
timestamp = timestamp.toUpperCase();

var options = {
	debug : 0,
	all : true,
	overwrite : false,
	version : 'DEV',
	revision : 0,
	timestamp : timestamp
};

if ( argv.debugLevel ) {
	options.debug = argv.debugLevel;
}

if ( argv.overwrite ) {
	options.overwrite = true;
}

if ( argv.buildConfig ) {
	options.buildConfig = argv.buildConfig;
}

if ( argv.skipOmittedInBuildConfig ) {
	options.all = false;
}

if ( argv.version ) {
	options.version = argv.version;
}

if ( argv.core ) {
	options.core = true;
}

if ( argv.commercial ) {
	options.commercial = true;
}

if ( argv.revision ) {
	options.revision = argv.revision;
}

if ( argv.leaveJsUnminified ) {
	options.leaveJsUnminified = true;
}

if ( argv.leaveCssUnminified ) {
	options.leaveCssUnminified = true;
}

if ( argv.noZip ) {
	options.noZip = true;
}

if ( argv.noIeChecks ) {
	options.noIeChecks = true;
}

if ( argv.noTar ) {
	options.noTar = true;
}

module.exports = options;
