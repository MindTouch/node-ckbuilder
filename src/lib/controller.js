/*
 Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
 For licensing, see LICENSE.md
 */

"use strict";

const argv = require( "yargs" )
	.boolean( [
		"build",
		"generate-build-config",
		"preprocess-core",
		"preprocess-plugin",
		"preprocess-skin",
		"build-skin",
		"verify-plugin",
		"verify-skin"
	] ).argv;
const ckbuilder = {
	io: require( "./io" ),
	builder: require( "./builder" ),
	plugin: require( "./plugin" ),
	config: require( "./config" ),
	skin: require( "./skin" ),
	tools: require( "./tools" ),
	options: require( "./options" ),
	error: require( "./error" )
};

/**
 * Object with functions which are called for appropriate commands.
 * Key is command name and value is function which is called with `CKBuilder.Controller` context
 * and two arguments:
 * first - Array of strings which are command line arguments
 * second - Command line instance {org.apache.commons.cli.CommandLine}
 *
 * @type {Object}
 */
const commandsHandlers = {
	'help': function() {
		this.printHelp( [ "help.txt" ] );
	},
	'full-help': function() {
		this.printHelp( [ "help.txt", "help-extra.txt" ] );
	},
	'build-help': function() {
		this.printHelp( [ "help-build.txt" ] );
	},
	'build': function() {
		if ( argv._.length < 2 ) {
			ckbuilder.error( "The build command requires two arguments." );
		}

		const builder = ckbuilder.builder( argv._[ 0 ], argv._[ 1 ] );
		if ( ckbuilder.options.core ) {
			builder.generateCore();
		} else {
			builder.generateBuild();
		}
	},
	'generate-build-config': function() {
		if ( argv._.length < 1 ) {
			ckbuilder.error( "The generate-build-config command requires an argument." );
		}

		ckbuilder.config.create( argv._[ 0 ] );
	},
	'preprocess-core': function() {
		if ( argv._.length < 2 ) {
			ckbuilder.error( "The preprocess-core command requires two arguments." );
		}

		const builder = ckbuilder.builder( argv._[ 0 ], argv._[ 1 ] );
		builder.preprocess();
	},
	'preprocess-plugin': function() {
		if ( argv._.length < 2 ) {
			ckbuilder.error( "The preprocess-plugin command requires two arguments." );
		}

		ckbuilder.plugin.preprocess( argv._[ 0 ], argv._[ 1 ] );
		console.log( "Plugin preprocessed successfully" );
	},
	'preprocess-skin': function() {
		if ( argv._.length < 2 ) {
			ckbuilder.error( "The preprocess-skin command requires two arguments." );
		}

		ckbuilder.skin.preprocess( argv._[ 0 ], argv._[ 1 ] );
		console.log( "Skin preprocessed successfully" );
	},
	'build-skin': function() {
		if ( argv._.length < 2 ) {
			ckbuilder.error( "The build-skin command requires two arguments." );
		}

		ckbuilder.skin.build( argv._[ 0 ], argv._[ 1 ] );
	},
	'verify-plugin': function() {
		var opts = {};

		if ( argv.name ) {
			opts.pluginName = String( argv.name );
		}

		if ( argv._.length < 1 ) {
			ckbuilder.error( "The verify-plugin command requires an argument." );
		}

		console.log( ckbuilder.plugin.verify( argv._[ 0 ], opts ) );
	},
	'verify-skin': function() {
		var opts = {};
		if ( argv.name ) {
			opts.pluginName = String( argv.name );
		}

		if ( argv._.length < 1 ) {
			ckbuilder.error( "The verify-skin command requires an argument." );
		}

		console.log( ckbuilder.skin.verify( argv._[ 0 ], opts ) );
	}
};

/**
 * The main controller, parses the command line options and calls the right methods.
 *
 * @class
 * @constructor
 */
class Controller {
	/**
	 * Prints all available options.
	 *
	 * @param {Array} types
	 */
	printHelp( types ) {
		const date = new Date();

		for ( let i = 0; i < types.length; i++ ) {
			console.log( "\n" + ckbuilder.io.readFile( "src/assets/" + types[ i ] ) );
		}

		console.log( "Copyright (c) 2003-" + date.getFullYear() + ", CKSource - Frederico Knabben" );
	}

	/**
	 * Executes commands based on passed arguments.
	 */
	run() {
		let foundCommandName = null;
		for ( let commandName in commandsHandlers ) {
			if ( argv[ commandName ] ) {
				foundCommandName = commandName;
				break;
			}
		}

		foundCommandName = foundCommandName || "help";

		commandsHandlers[ foundCommandName ].call( this );
	}
};

module.exports = Controller;
