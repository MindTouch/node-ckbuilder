#!/bin/sh

# Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
# For licensing, see LICENSE.md

# Builds CKEditor release using the source version of CKBuilder (useful for debugging issues in CKBuilder).

echo ""
echo "Starting CKBuilder..."

SCRIPTDIR=$(dirname $0)

# Move to the script directory.
cd $SCRIPTDIR/ckeditor

rev=`git rev-parse --verify --short HEAD`

# Move to the CKBuilder root folder.
cd ../../..

node src/ckbuilder.js --build dev/scripts/ckeditor dev/scripts/release --build-config dev/scripts/ckeditor/dev/builder/build-config.js --overwrite --version=DEV --revision=$rev $@

cd $SCRIPTDIR

echo ""
echo "Release created in the \"release\" directory."
