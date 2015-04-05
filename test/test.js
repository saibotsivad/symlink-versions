var versioner = require('../')

var path = require('path')
var test = require('tape')
var fs = require('fs-extra')
var rmdirCallback = require('rmdir')
var Promise = require('promise')

var mkdirp = Promise.denodeify(fs.ensureDir)
var flstat = Promise.denodeify(fs.lstat)
var fappend = Promise.denodeify(fs.appendFile)
var rmdir = Promise.denodeify(rmdirCallback)

var DIR = __dirname
var BACKUP_FOLDER = path.join(DIR, 'tmp')
var FILE_FOLDER = path.join(DIR, 'sample-data')
var FILES = [ 'sample1.txt', 'sample2.txt', 'inner-folder/sample3.txt' ]
var FILE_TO_CHANGE = FILES[0]

test('backup folder does not exist', function(t) {
	var options = {
		backupFolder: 'folder_that_does_not_exist',
		fileFolder: FILE_FOLDER
	}
	versioner(options).catch(function(err) {
		t.ok(err, 'should throw error')
		t.end()
	})
})

test('file folder does not exist', function(t) {
	var options = {
		backupFolder: BACKUP_FOLDER,
		fileFolder: 'folder_that_does_not_exist'
	}
	mkdirp(BACKUP_FOLDER).then(function() {
		versioner(options).catch(function(err) {
			t.ok(err, 'should throw error')
			t.end()
		})
	})
})

test('a complete flow', function(t) {
	var options = {
		backupFolder: BACKUP_FOLDER,
		fileFolder: FILE_FOLDER,
		forceVersionWhenEmpty: true
	}
	mkdirp(BACKUP_FOLDER)
	.then(function() {
		// make a version when none exists
		return versioner(options)
	})
	.then(function(version) {
		return wasCompletelyNewVersionMade(version)
	})
	.then(function(result) {
		t.ok(result, 'completely new version should be made')
	})
	.then(waitSomeTime)
	.then(function() {
		// make a version when there are no changes
		return versioner(options)
	})
	.then(function(version) {
		return newVersionIsOnlySymlinks(version)
	})
	.then(function(result) {
		t.ok(result, 'new version should only be symlinks')
	})
	.then(waitSomeTime)
	.then(function() {
		return makeChangeToFile()
	})
	.then(function() {
		// make a version when there are some changes
		return versioner(options)
	})
	.then(function(version) {
		return onlyChangedFilesWereCopied(version)
	})
	.then(function(result) {
		t.ok(result, 'new version should only be symlinks')
	})
	.then(waitSomeTime)
	.then(function() {
		// no changes, and do not make version
		delete options.forceVersionWhenEmpty
		versioner(options).catch(function(err) {
			t.ok(err, 'should throw an error')
			t.ok(err.noActionTaken, 'the specific error')
			// we are done, just do the cleanup
			rmdir(BACKUP_FOLDER).then(function() {
				t.end()
			})
		})
	})
})

function waitSomeTime() {
	return new Promise(function(resolve) {
		setTimeout(resolve, 2 * 1000)
	})
}

function wasCompletelyNewVersionMade(version) {
	return Promise.all(FILES.map(function(file) {
		return path.join(BACKUP_FOLDER, version, file)
	}).map(function(file) {
		return flstat(file).then(function(stat) {
			return stat.isSymbolicLink()
		})
	})).then(function(files) {
		return files.every(function(isSymlink) {
			return !isSymlink
		})
	})
}

function newVersionIsOnlySymlinks(version) {
	return Promise.all(FILES.map(function(file) {
		return path.join(BACKUP_FOLDER, version, file)
	}).map(function(file) {
		return flstat(file).then(function(stat) {
			return stat.isSymbolicLink()
		})
	})).then(function(files) {
		return files.every(function(isSymlink) {
			return isSymlink
		})
	})
}

function makeChangeToFile() {
	return fappend(path.join(FILE_FOLDER, FILE_TO_CHANGE), 'this is the new data')
}

function onlyChangedFilesWereCopied(version) {
	var linkFilePromises = FILES.filter(function(file) {
		return file !== FILE_TO_CHANGE
	})
	.map(function(file) {
		return path.join(BACKUP_FOLDER, version, file)
	})
	.map(function(file) {
		return flstat(file).then(function(stat) {
			return stat.isSymbolicLink()
		})
	})

	var realFilePromise = flstat(path.join(BACKUP_FOLDER, version, FILE_TO_CHANGE)).then(function(stat) {
		return !stat.isSymbolicLink()
	})

	var promises = linkFilePromises.concat([ realFilePromise ])

	return Promise.all(promises).then(function(results) {
		return results.every(function(isOkay) {
			return isOkay
		})
	})
}
