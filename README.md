CKBuilder
=========

This repository contains the source files of CKBuilder, **a command line builder** for [CKEditor](https://github.com/ckeditor/ckeditor-dev).

CKBuilder generates release packages of CKEditor out of its source code. 

### Using CKBuilder source files

You can generate a CKEditor release version using CKBuilder source files by running `build.sh` available in the `dev\scripts` folder. The release version of CKEditor will be generated in the `release` folder.
Make sure to download the CKEditor submodule first:

	> git submodule update --init

### Using ckbuilder.js

Run

    > ./dev/builder/build.sh

That's it - a "release" version of CKEditor will be built in the new `dev/builder/release/` folder. 

**Note:** CKBuilder which is run by calling ```build.sh``` script will use default ```build-config.js``` which define skin, files to be ignored and plugins. For more information about build-config run builder with ```--build-help``` command.
 
**Note2:** The shell script is designed to run on Mac/Linux. If you are a Windows user, install [Git for Windows](http://msysgit.github.io/), make sure "Git Bash" is checked during the installation process and then run this script using "Git Bash".

To get the list of all available commands and options, run:

	> node src/ckbuilder.js --help

#### Available commands

This is just an overview of available commands. For more details, check the built-in help options.

**--help | --build-help | --full-help**

Display various help information.

**--build**

Build CKEditor, definitely the most frequently used command.

**--build-skin**

Creates a release version of a skin (icons are merged into a single strip image, CSS files are merged and minified, JavaScript files are minified). 

Note: if you want to share your skin with others, do **not** upload the release version of a skin to the [CKEditor addons repository](http://ckeditor.com/addons/skins/all), upload the source version instead.

**--verify-plugin | --verify-skin**

Used by the online builder to verify if a plugin or skin is valid. If you have problems with uploading a skin or a plugin, it might be because this command returned errors.

**--preprocess-core | --preprocess-plugin | --preprocess-skin**

Used by the [online builder](http://ckeditor.com/builder), unless you intend to do a similar service, you don't need it.

**--generate-build-config**

Creates a fresh `build-config.js`.

### Build config



### License

Licensed under the terms of the MIT License. For full details about license, please check LICENSE.md file.
