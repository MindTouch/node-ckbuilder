/*
 Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
 For licensing, see LICENSE.md
 */

"use strict";

const fs = require( "fs-extra" );
const path = require( "path" );
const ckbuilder = {
	io: require( "./io" ),
	tools: require( "./tools" ),
	options: require( "./options" )
};

const regexLib = {
	pluginsSamples: new RegExp( '<!--\\s*PLUGINS_SAMPLES\\s*?-->' ),
	advancedSamples: new RegExp( '<!--\\s*ADVANCED_SAMPLES\\s*-->' ),
	inlineEditingSamples: new RegExp( '<!--\\s*INLINE_EDITING_SAMPLES\\s*-->' ),
	metaTag: new RegExp( '<meta([\\s\\S]*?)>', 'g' ),
	metaName: new RegExp( 'name="([\\s\\S]*?)"' ),
	metaContent: new RegExp( 'content="([\\s\\S]*?)"' )
};

/**
 * Holds URLs, names and descriptions of samples found in meta tags.
 *
 * @property {Object} samplesMetaInformation
 * @member ckbuilder.samples
 */
const samplesMetaInformation = {
	'beta': {},
	'new': {},
	'normal': {}
};

/**
 * Returns an information gathered from the <meta> tag in HTML.
 *
 * @param {String} text
 * @returns {Object}
 * @private
 * @member ckbuilder.samples
 */
function getMetaInformation( text ) {
	var matcher;
	var metaInformation = {};

	while ( ( matcher = regexLib.metaTag.exec( text ) ) !== null ) {
		var metaText = matcher[ 1 ];
		var metaNameMatcher = regexLib.metaName.exec( metaText );
		var metaContentMatcher = regexLib.metaContent.exec( metaText );

		if ( metaContentMatcher !== null && metaNameMatcher !== null ) {
			metaInformation[ metaNameMatcher[ 1 ].replace( /^ckeditor-sample-/, '' ) ] = metaContentMatcher[ 1 ];
		}
	}

	if ( !metaInformation.group || ( metaInformation.group !== 'Inline Editing' && metaInformation.group !== 'Advanced Samples' ) ) {
		metaInformation.group = 'Plugins';
	}

	return metaInformation;
}

/**
 * Checks every plugin folder for the "samples" directory, moves the samples into the root "samples directory.
 *
 * @param {java.io.File} sourceLocation
 * @private
 * @member ckbuilder.samples
 */
function mergePluginSamples( sourceLocation ) {
	var pluginsLocation = path.resolve( sourceLocation, "plugins" );
	if ( !ckbuilder.io.exists( pluginsLocation ) ) {
		return;
	}

	var children = fs.readdirSync( pluginsLocation );
	children.sort();
	for ( var i = 0; i < children.length; i++ ) {
		if ( children[ i ] === ".svn" || children[ i ] === "CVS" || children[ i ] === ".git" ) {
			continue;
		}

		// Find the "samples" folder
		var pluginSamplesLocation = path.join( pluginsLocation, children[ i ] + '/samples' );
		if ( ckbuilder.io.exists( pluginSamplesLocation ) && fs.statSync( pluginSamplesLocation ).isDirectory() ) {
			mergeSamples( pluginSamplesLocation, path.join( sourceLocation, 'samples/old/' + children[ i ] ), children[ i ] );
			ckbuilder.io.deleteDirectory( pluginSamplesLocation );
		}
	}
}

/**
 * Moves samples from source to the target location, gathers information stored in meta tags.
 *
 * @param {java.io.File} sourceLocation
 * @param {java.io.File} targetLocation
 * @param {String} samplePath URL to a sample, relative to the location of index.html with link to old samples
 * @private
 * @member ckbuilder.samples
 */
function mergeSamples( sourceLocation, targetLocation, samplePath ) {
	if ( fs.statSync( sourceLocation ).isDirectory() ) {
		fs.ensureDirSync( targetLocation );

		var children = fs.readdirSync( sourceLocation );
		for ( var i = 0; i < children.length; i++ ) {
			if ( children[ i ] === ".svn" || children[ i ] === "CVS" || children[ i ] === ".git" ) {
				continue;
			}

			mergeSamples( path.resolve( sourceLocation, children[ i ] ), path.resolve( targetLocation, children[ i ] ), samplePath + '/' + children[ i ] );
		}

		if ( !fs.readdirSync( targetLocation ).length ) {
			fs.removeSync( targetLocation );
		}
	} else {
		ckbuilder.io.copyFile( sourceLocation, targetLocation );
		if ( ckbuilder.io.getExtension( path.basename( sourceLocation ) ) !== 'html' ) {
			return;
		}

		var text = ckbuilder.io.readFile( sourceLocation );

		// check if required meta information is available
		if ( text.indexOf( "ckeditor-sample-name" ) === -1 ) {
			return;
		}

		var meta = getMetaInformation( text );
		if ( meta.isbeta ) {
			samplesMetaInformation['beta'][ samplePath ] = meta; // jshint ignore:line
		} else if ( meta.isnew ) {
			samplesMetaInformation['new'][ samplePath ] = meta;
		} else {
			samplesMetaInformation['normal'][ samplePath ] = meta; // jshint ignore:line
		}
	}
}

/**
 * Returns a single definition list that represents one sample.
 *
 * @param {String} url URL to a sample
 * @param {Object} info An object with information like name and description
 * @returns {String}
 * @private
 * @member ckbuilder.samples
 */
function linkToSample( url, info ) {
	if ( !info.name ) {
		return '';
	}

	// Support <code>, <em> and <strong> tags
	var description = info.description.replace( /&lt;(\/?(?:code|strong|em))&gt;/g, '<$1>' );

	// <dt><a class="samples" href="api.html">Basic usage of the API</a></dt>
	// <dd>Using the CKEditor JavaScript API to interact with the editor at runtime.</dd>
	var out = [];
	out.push( "\n", '<dt><a class="samples" href="', url, '">', info.name, '</a>' );
	if ( info.isnew ) {
		out.push( ' <span class="new">New!</span>' );
	}
	if ( info.isbeta ) {
		out.push( ' <span class="beta">Beta</span>' );
	}
	out.push( '</dt>', "\n" );
	out.push( '<dd>', description, '</dd>', "\n" );

	return out.join( '' );
}

/**
 * Returns HTML structure for the "Plugins" section.
 *
 * @param {String} html HTML code with definition lists containing links to samples
 * @returns {String}
 * @member ckbuilder.samples
 */
function pluginsSection( html ) {
	if ( !html ) {
		return '';
	}

	return '<h2 class="samples">Plugins</h2>' + "\n" + '<dl class="samples">' + html + '</dl>';
}

/**
 * Prepare samples.
 *
 * @class
 */
ckbuilder.samples = {

	/**
	 * Merges samples from plugins folders into the root "samples/old" folder.
	 *
	 * @param {java.io.File} sourceLocation Path to CKEditor, where the "samples" and "plugins" folders are available.
	 * @static
	 */
	mergeSamples: function( sourceLocation ) {
		var samplesFolder = 'samples/old';
		var samplesLocation = path.resolve( sourceLocation, samplesFolder );
		if ( !ckbuilder.io.exists( samplesLocation ) ) {
			if ( ckbuilder.options.debug ) {
				console.log( "INFO: " + samplesFolder + " dir not found in " + path.resolve( sourceLocation ) );
			}
			return;
		}
		var indexFile = path.join( samplesLocation, 'index.html' );
		if ( !ckbuilder.io.exists( indexFile ) ) {
			if ( ckbuilder.options.debug ) {
				console.log( "index.html not found in the " + samplesFolder + " directory: " + samplesLocation );
			}
			return;
		}

		var indexHtml = ckbuilder.io.readFile( indexFile );
		indexHtml = ckbuilder.tools.processDirectivesInString( indexHtml );

		// Nothing to do
		if ( indexHtml.indexOf( "PLUGINS_SAMPLES" ) === -1 && indexHtml.indexOf( "ADVANCED_SAMPLES" ) === -1 && indexHtml.indexOf( "INLINE_EDITING_SAMPLES" ) === -1 ) {
			if ( ckbuilder.options.debug ) {
				console.log( samplesFolder + '/index.html does not contain any placeholders to replace' );
			}
			ckbuilder.io.saveFile( indexFile, indexHtml, true );
			return;
		}

		mergePluginSamples( sourceLocation );

		var html = {
			'Inline Editing': '',
			'Advanced Samples': '',
			'Plugins': ''
		};

		for ( var type in samplesMetaInformation ) {
			for ( var url in samplesMetaInformation[ type ] ) {
				html[ samplesMetaInformation[ type ][ url ].group ] += linkToSample( url, samplesMetaInformation[ type ][ url ] );
			}
		}

		/* jshint sub: true */
		indexHtml = indexHtml.replace( regexLib.pluginsSamples, pluginsSection( html[ 'Plugins' ] ) );
		indexHtml = indexHtml.replace( regexLib.inlineEditingSamples, html[ 'Inline Editing' ] );
		indexHtml = indexHtml.replace( regexLib.advancedSamples, html[ 'Advanced Samples' ] );
		/* jshint sub: false */

		ckbuilder.io.saveFile( indexFile, indexHtml, true );
	}
};

module.exports = ckbuilder.samples;
