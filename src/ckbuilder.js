/*
 Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
 For licensing, see LICENSE.md
 */

"use strict";

if ( require.main === module ) {
	const Controller = require( "./lib/controller" );
	const controller = new Controller();
	controller.run();
} else {
	const ckbuilder = {
		builder: require( "./lib/builder" ),
		config: require( "./lib/config" ),
		css: require( "./lib/css" ),
		image: require( "./lib/image" ),
		io: require( "./lib/io" ),
		javascript: require( "./lib/javascript" ),
		lang: require( "./lib/lang" ),
		options: require( "./lib/options" ),
		plugin: require( "./lib/plugin" ),
		samples: require( "./lib/samples" ),
		skin: require( "./lib/skin" ),
		tools: require( "./lib/tools" ),
		utils: require( "./lib/utils" )
	};
	module.exports = ckbuilder;
}
