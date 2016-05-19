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
	utils: require( "./utils" ),
	options: require( "./options" )
};

var translations = {};

/**
 * This method modifies translations property.
 *
 * @param {java.io.File} sourceLocation Source folder. Directory which represents plugin, so is located in `plugins` directory.
 * @member ckbuilder.lang
 */
function loadPluginLanguageFiles( sourceLocation ) {
	var folder = path.join( sourceLocation, 'lang' );

	if ( !ckbuilder.io.exists( folder ) ) {
		return;
	}

	var englishFile = path.join( folder, 'en.js' );
	var englishObj = ckbuilder.lang.loadLanguageFile( englishFile ).translation;

	for ( var langCode in translations ) {
		var langFile = path.join( folder, langCode + '.js' );
		var langObj;

		if ( ckbuilder.io.exists( langFile ) ) {
			langObj = ckbuilder.utils.merge( englishObj, ckbuilder.lang.loadLanguageFile( langFile ).translation );
		} else {
			langObj = englishObj;
		}

		translations[ langCode ] = ckbuilder.utils.merge( translations[ langCode ], langObj );
	}
}

/**
 * @param {java.io.File} folder
 * @member ckbuilder.lang
 */
function loadCoreLanguageFiles( folder ) {
	translations.en = ckbuilder.lang.loadLanguageFile( path.join( folder, "en.js" ) ).translation;

	var children = fs.readdirSync( folder );
	for ( var i = 0; i < children.length; i++ ) {
		var langFile = children[ i ].match( /^([a-z]{2}(?:-[a-z]+)?)\.js$/ );
		if ( langFile ) {
			var langCode = langFile[ 1 ];
			translations[ langCode ] = ckbuilder.utils.merge( translations.en, ckbuilder.lang.loadLanguageFile( path.join( folder, children[ i ] ) ).translation );
		}
	}
}

/**
 * @param langCode
 * @returns {string}
 * @member ckbuilder.lang
 */
function printTranslation( langCode ) {
	if ( ckbuilder.options.leaveJsUnminified ) {
		return ckbuilder.utils.copyright( "\r\n" ) + "CKEDITOR.lang['" + langCode + "'] = {\n" + ckbuilder.utils.prettyPrintObject( translations[ langCode ], '    ' ) + " }; ";
	} else {
		return ckbuilder.utils.copyright( "\n" ) + "CKEDITOR.lang['" + langCode + "']=" + JSON.stringify( translations[ langCode ] ) + ";";
	}
}

/**
 * Gather translations from CKEditor, merge them and sace into single file.
 *
 * @class
 */
ckbuilder.lang = {
	/**
	 * @param {String} sourceLocation Path to the folder with source files
	 * @param {String} targetLocation The target folder where to save the resulting files
	 * @param {Object} pluginNames Object with a set of plugins included in build
	 * @param {Object} languages (Optional) Object with languages included in build (if empty, all languages are used)
	 * @static
	 */
	mergeAll: function( sourceLocation, targetLocation, pluginNames, languages ) {
		var langLocation = path.join( sourceLocation, "lang" );
		if ( !ckbuilder.io.exists( langLocation ) ) {
			throw( "Language folder is missing: " + path.resolve( langLocation ) );
		}

		var pluginsLocation = path.join( sourceLocation, "plugins" );
		if ( !ckbuilder.io.exists( pluginsLocation ) ) {
			throw( "Plugins folder is missing: " + path.resolve( pluginsLocation ) );
		}

		loadCoreLanguageFiles( langLocation );

		// Load plugins language files
		var children = fs.readdirSync( pluginsLocation );
		children.sort();
		for ( var i = 0; i < children.length; i++ ) {
			var folderName = children[ i ];
			if ( folderName === ".svn" || folderName === "CVS" || folderName === ".git" ) {
				continue;
			}

			// Do not load language files from plugins that are not enabled.
			if ( pluginNames[ folderName ] ) {
				loadPluginLanguageFiles( path.join( pluginsLocation, children[ i ] ) );
			}
		}

		for ( var langCode in translations ) {
			if ( !languages || languages[ langCode ] ) {
				ckbuilder.io.saveFile( path.join( targetLocation, langCode + ".js" ), printTranslation( langCode ), true );
			} else {
				ckbuilder.io.deleteFile( path.join( targetLocation, langCode + ".js" ) );
			}
		}
	},

	/**
	 * Load language file and return an object with the whole translation.
	 *
	 * @param {java.io.File} file Language file to load.
	 * @returns {{languageCode: String, translation: Object }}
	 * @static
	 */
	loadLanguageFile: function( file ) {
		var translationCode = 'var CKEDITOR = { lang : {}, plugins : { setLang : function(plugin, langCode, obj) { if(!CKEDITOR.lang[langCode]) CKEDITOR.lang[langCode] = {};CKEDITOR.lang[langCode][plugin] = obj; } } }; ' + ckbuilder.io.readFile( file );
		var script = new vm.Script( translationCode, { filename: file } );
		var scope = {};
		vm.createContext( scope );

		try {
			script.runInContext( scope );

			/*
			 * Return the first entry from scope.CKEDITOR.lang object
			 */
			for ( var languageCode in scope.CKEDITOR.lang ) {
				return {
					languageCode: languageCode,
					translation: scope.CKEDITOR.lang[ languageCode ]
				};
			}
		} catch ( e ) {
			throw( "Language file is invalid: " + path.resolve( file ) + ".\nError: " + e.message );
		}
	}
};

module.exports = ckbuilder.lang;
