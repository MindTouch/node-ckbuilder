
"use strict";

module.exports = function( msg ) {
	console.error( new Error( msg ) );
	process.exit( 1 );
};
