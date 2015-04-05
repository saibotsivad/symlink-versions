# symbolic-versions

If you have a folder you want to backup and you want *all* old versions to
be available as folders, you can copy files every time you do a backup, or
you can make a new folder where everything unchanged is a symlink.

## install

Install the normal npm way:

	npm install symbolic-versions

## use

Specify the place to backup files (must be a created folder) and the folder
to scan for changes:

	var versioner = require('symbolic-versions')
	var options = {
		backupFolder: '/path/to/backup',
		fileFolder: '/path/to/monitored/files'
	}
	versioner(options, function(err, version) {
		// "version" is the folder created inside the "backupFolder"
	})

The function will return a promise, if you want to do that instead:

	versioner(options)
		.then(function(version) {
			// "version" is the folder created inside the "backupFolder"
		})
		.catch(function(err) {
			// handle errors
		})

## options

There are only the three options:

* `options.backupFolder` *(required)* - The *complete* path to the location used for backing up files.
* `options.fileFolder` *(required)* - The *complete* path to the location of the watched files.
* `options.forceVersionWhenEmpty` *(optional, default false)* - Whether a new version should be made
	if there have been no changes between the watched files and the most recent backup.

## what it does

Suppose you have a folder with the files `file1.txt` and `file2.txt`. After running the process the first
time, you'll have a folder that contains both files.

Next, change the file `file1.txt`, and after running the process again you'll have a folder that contains
the modified file `file1.txt`, and a symlink `file2.txt` that links to the first version's folder.

Finally, inside your backup folder you have two version folders, one with two real files, and one with
a real file and a symlink to the original file.

## license

Released under the [Very Open License](http://veryopenlicense.com)
