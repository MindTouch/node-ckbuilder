/*
 Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
 For licensing, see LICENSE.md
 */

"use strict";

const fs = require( "fs-extra" );
const path = require( "path" );
const Canvas = require( "canvas" );
const Image = Canvas.Image;
const ckbuilder = {
	io: require( "./io" ),
	utils: require( "./utils" ),
	options: require( "./options" )
};

/**
 * Iterating through files in directory and when file has one of the following
 * png, jpg, gif extension then file absolute path is set as a value and
 * file name is set as a key
 *
 * @param {java.io.File} directory
 * @param {Object=} paths
 * @private
 * @returns {Object}
 * @member ckbuilder.image
 */
function getAbsolutePathForImageFiles( directory, paths ) {
	paths = paths || {};

	var files = fs.readdirSync( directory ).sort();
	for ( var i = 0; i < files.length; i++ ) {
		var f = path.resolve( directory, files[ i ] );

		if ( fs.statSync( f ).isFile() ) {
			var extension = ckbuilder.io.getExtension( files[ i ] );
			if ( extension === "png" || extension === "jpg" || extension === "gif" ) {
				var fileName = files[ i ].slice( 0, files[ i ].indexOf( "." ) );
				paths[ fileName ] = f;
			}
		}
	}

	return paths;
}

/**
 * Responsible for generating sprite with icons.
 *
 * @class
 */
ckbuilder.image = {
	/**
	 * @param {java.io.File} sourceLocation
	 * @param {Boolean} hidpi
	 * @static
	 */
	findIcons: function( sourceLocation, hidpi ) {
		if ( !sourceLocation || !ckbuilder.io.exists( sourceLocation ) ) {
			return {};
		}

		var result = {};
		var children = fs.readdirSync( sourceLocation ).sort();
		for ( var i = 0; i < children.length; i++ ) {
			var child = path.resolve( sourceLocation, children[ i ] );

			// Handle only directories
			if ( !fs.statSync( child ).isDirectory() ) {
				continue;
			}

			if ( String( children[ i ] ) === "icons" ) {
				getAbsolutePathForImageFiles( child, result );

				// When the "hidpi" flag is set, overwrite 16px icons with hidpi versions.
				// Searching above for 16px icons still makes sense, because a plugin may not
				// provide hidpi icons at all.
				if ( hidpi ) {
					var hidpiFolder = path.resolve( child, 'hidpi' );
					if ( !ckbuilder.io.exists( hidpiFolder ) || !fs.statSync( hidpiFolder ).isDirectory() ) {
						continue;
					}

					getAbsolutePathForImageFiles( hidpiFolder, result );
				}
			// When directory name is not "icons", going deeper.
			} else {
				var icons = ckbuilder.image.findIcons( child, hidpi );
				result = ckbuilder.utils.merge( result, icons );
			}
		}

		return result;
	},

	/**
	 * Creates a complete sprite, based on passed plugins and skin location.
	 *
	 * @param {java.io.File} pluginsLocation
	 * @param {java.io.File} skinLocation
	 * @param {java.io.File} outputFile
	 * @param {java.io.File} outputCssFile
	 * @param {String[]} pluginNamesSorted
	 * @param {Boolean} [hidpi=false]
	 * @returns {*}
	 * @static
	 */
	createFullSprite: function( pluginsLocation, skinLocation, outputFile, outputCssFile, pluginNamesSorted, hidpi ) {
		var pluginIcons = {};

		// Include all available icons
		if ( ckbuilder.options.all ) {
			pluginIcons = ckbuilder.image.findIcons( pluginsLocation, hidpi );
		}

		// Include in strip image only icons provided by plugins included in core
		else {
			for ( var i = 0; i < pluginNamesSorted.length; i++ ) {
				var pluginName = pluginNamesSorted[ i ];
				var pluginFolder = path.resolve( pluginsLocation, pluginName );

				if ( ckbuilder.io.exists( pluginFolder ) && fs.statSync( pluginFolder ).isDirectory() ) {
					var result = ckbuilder.image.findIcons( pluginFolder, hidpi );
					pluginIcons = ckbuilder.utils.merge( result, pluginIcons, true );
				}
			}
		}
		var skinIcons = ckbuilder.image.findIcons( skinLocation, hidpi );
		var icons = ckbuilder.utils.merge( pluginIcons, skinIcons, false );

		if ( ckbuilder.options.debug > 1 ) {
			console.log( "Generating sprite image" );
			console.log( "\n== Plugin names ==\n" );
			console.log( pluginNamesSorted.join( "," ) );
			console.log( "\n== Plugin icons ==\n" );
			console.log( ckbuilder.utils.prettyPrintObject( pluginIcons ) );
			console.log( "\n== Skin icons ==\n" );
			console.log( ckbuilder.utils.prettyPrintObject( skinIcons ) );
			console.log( "\n== Used icons ==\n" );
			console.log( ckbuilder.utils.prettyPrintObject( icons ) );
		}

		var files = Object.keys( pluginIcons ) // Map to paths array.
			.map( function( buttonName ) {
				return icons[ buttonName ];
			} ) // Sort in paths order, so icon-rtl.png will be before icon.png.
			.sort() // Map to files array.
			.map( function( iconPath ) {
				return path.resolve( iconPath );
			} );

		return this.createSprite( files, outputFile, outputCssFile, hidpi );
	},

	/**
	 * Generate sprite file from given images.
	 *
	 * @param {Array} files An array with image files ({java.io.File})
	 * @param {Boolean} outputFile Where to save sprite image
	 * @param {java.io.File} outputCssFile Where to save CSS information about buttons
	 * @param {Boolean} hidpi Whether to create hidpi strip image
	 * @static
	 */
	createSprite: function( files, outputFile, outputCssFile, hidpi ) {
		if ( !files.length ) {
			if ( ckbuilder.options.debug ) {
				console.log( "No images given, sprite file will not be created." );
			}
			return '';
		}

		var totalHeight = 0;
		var iconsOffset = [];
		var iconsHasRtl = {};
		var minimumIconSpace = hidpi ? 16 : 8;
		var cssRules = [];

		if ( outputCssFile && ckbuilder.io.exists( outputCssFile ) ) {
			cssRules.push( ckbuilder.io.readFile( outputCssFile ) || "" );
		}

		// Read images
		var i;

		// each image is an object with keys:
		// {Boolean} isHidpi
		// {java.awt.image.BufferedImage} bufferedImage
		// {String} fileName
		var images = [];

		// while iterating through images there is determined highest icon width and height
		var maxIconWidth = 0;
		var maxIconHeight = 0;

		for ( i = 0; i < files.length; i++ ) {
			var bufferedImage = fs.readFileSync( files[ i ] );
			var img = new Image;
			img.src = bufferedImage;

			images[ i ] = {
				isHidpi: String( path.resolve( files[ i ] ) ).replace( /\\/g, '/' ).indexOf( "/icons/hidpi/" ) !== -1,
				bufferedImage: img,
				fileName: path.basename( files[ i ] )
			};
			images[ i ].width = img.width;
			images[ i ].height = img.height;

			// Humm huge images? That's probably not an icon, ignore that file.
			if ( images[ i ].height > 100 || images[ i ].width > 100 ) {
				console.log( "WARNING: cowardly refused to add an image to a sprite because it's too big: " + path.resolve( files[ i ] ) );
				images[ i ] = null;
				continue;
			}
			maxIconHeight = Math.max( images[ i ].height, maxIconHeight );
			maxIconWidth = Math.max( images[ i ].width, maxIconWidth );
		}
		// Get rid of images that turned out to be too big
		images = images.filter( function( image ) {
			return !!image;
		} );

		if ( maxIconWidth <= 0 ) {
			throw( 'Error while generating sprite image: invalid width (' + maxIconWidth + ')' );
		}

		var cssHidpiPrefix = hidpi ? ".cke_hidpi" : "";
		var iconsStrip = ( hidpi ? "icons_hidpi.png" : "icons.png" ) + "?t=" + ckbuilder.options.timestamp;

		for ( i = 0; i < images.length; i++ ) {
			var buttonName = images[ i ].fileName.match( /.*?(?=\.|-rtl)/ );
			var buttonSelector = ".cke_button__" + buttonName + '_icon';
			var ypos;
			var backgroundSize;
			var cssBackgroundSize;

			if ( hidpi ) {
				if ( images[ i ].isHidpi ) {
					backgroundSize = Math.round( maxIconWidth / 2 ) + "px";
					cssBackgroundSize = "background-size: " + backgroundSize + " !important;";

					// This is the default value in CKEditor, so it does not make sense to specify it again
					if ( backgroundSize === '16px' ) {
						backgroundSize = "";
					}
					ypos = totalHeight / 2;
				} else {
					backgroundSize = "auto";
					cssBackgroundSize = "";
					ypos = totalHeight;
				}
			} else {

				// The icons folder in 3rd party plugins may contain surprises
				// As a result, the strip image may have unpredictable width
				// https://github.com/WebSpellChecker/ckeditor-plugin-wsc/issues/6
				// Here, with wsc plugin, the strip image had 108px width, so default background-size:16px was invalid
				// We need to always reset it to auto
				backgroundSize = "auto";
				cssBackgroundSize = "";
				ypos = totalHeight;
			}

			if ( images[ i ].fileName.indexOf( "-rtl" ) !== -1 ) {
				iconsHasRtl[ buttonName ] = 1;
				cssRules.push( ".cke_rtl" + cssHidpiPrefix + " " + buttonSelector + "," + // The "cke_mixed_dir_content" env class is to increase the specificity,
						// with RTL button in LTR editor.
						( cssHidpiPrefix ? " " : "" ) + cssHidpiPrefix + " .cke_mixed_dir_content .cke_rtl " + buttonSelector + " {background: url(" + iconsStrip + ") no-repeat 0 -" + ypos + "px !important;" + cssBackgroundSize + "}" );
				iconsOffset.push( buttonName + '-rtl' );
				iconsOffset.push( ypos );
				iconsOffset.push( backgroundSize );
			} else {
				var envSelector = ( buttonName in iconsHasRtl ? ".cke_ltr" : "" ) + cssHidpiPrefix;
				if ( envSelector ) {
					envSelector = envSelector + " ";
				}
				if ( hidpi && buttonName in iconsHasRtl ) {
					cssRules.push( ".cke_hidpi .cke_ltr " + buttonSelector + "," );
				}

				cssRules.push( envSelector + buttonSelector + " {background: url(" + iconsStrip + ") no-repeat 0 -" + ypos + "px !important;" + cssBackgroundSize + "}" );
				iconsOffset.push( buttonName );
				iconsOffset.push( ypos );
				iconsOffset.push( backgroundSize );
			}
			totalHeight = totalHeight + maxIconHeight + minimumIconSpace;
		}

		if ( totalHeight <= 0 ) {
			throw( 'Error while generating sprite image: invalid height (' + totalHeight + ')' );
		}

		if ( ckbuilder.options.debug ) {
			console.log( "Sprites generator: %s images. Total height: %spx, width: %spx", images.length, totalHeight, maxIconWidth );
		}

		// Create the actual sprite
		var canvas = new Canvas( maxIconWidth, totalHeight );
		var ctx = canvas.getContext( '2d' );
		var currentY = 0;

		for ( i = 0; i < images.length; i++ ) {
			ctx.drawImage( images[ i ].bufferedImage, 0, currentY );
			currentY = currentY + maxIconHeight + minimumIconSpace;
		}

		if ( ckbuilder.options.debug ) {
			console.log( "Saving sprite: ", path.resolve( outputFile ) );
		}

		fs.writeFileSync( outputFile, canvas.toBuffer() );
		if ( outputCssFile ) {
			if ( ckbuilder.options.debug ) {
				console.log( "Saving CSS rules to " + path.resolve( outputCssFile ) );
			}

			ckbuilder.io.saveFile( outputCssFile, cssRules.join( ckbuilder.options.leaveCssUnminified ? "\r\n" : "" ) );
		}
		return iconsOffset.join( ',' );
	}
};

module.exports = ckbuilder.image;
