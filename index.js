var Promise = require('promise')
var moment = require('moment')
var fs = require('fs-extra')
var glob = require('glob')
var path = require('path')

var mkdirp = Promise.denodeify(fs.ensureDir)
var fstat = Promise.denodeify(fs.stat)
var flstat = Promise.denodeify(fs.lstat)
var fcopy = Promise.denodeify(fs.copy)
var flink = Promise.denodeify(fs.symlink)
var globp = Promise.denodeify(glob)

module.exports = function(options, cb) {
	var promise = new Promise(function(resolve, reject) {
		if (!options || !options.backupFolder || !options.fileFolder) {
			var err = new Error('must specify options.backupFolder and options.fileFolder')
			err.configuration = true
			reject(err)
		} else {
			Promise.all([
				fstat(options.backupFolder),
				fstat(options.fileFolder)
			]).then(function() {
				main(options)
				.then(function() {
					resolve(options.currentBackup)
				})
				.catch(function(err) {
					reject(err)
				})
			}, function(err) {
				reject(err)
			})
		}
	})

	if (typeof cb === 'function') {
		promise.then(function(out) {
			cb(false, out)
		}).catch(function(err) {
			cb(err)
		})
	} else {
		return promise
	}
}

function main(options) {
	options.currentBackup = moment().format('YYYYMMDDhhmmss')
	return Promise.all([
		listAllFolderFiles(options.fileFolder).then(filePathsToStats(options.fileFolder)),
		mostRecentBackup(options.backupFolder).then(function(version) {
			if (version) {
				options.mostRecentBackup = version
				var versionBackupPath = path.join(options.backupFolder, version)
				return listAllFolderFiles(versionBackupPath).then(filePathsToStats(versionBackupPath))
			} else {
				return []
			}
		})
	])
	.then(pickTheImportantFiles)
	.then(continueOnlyIfThereAreFiles(options))
	.then(createDirectoryStructure(options))
	.then(function copyOrSymlinkFiles(files) {
		return Promise.all([
			copyFiles(options, files.toCopy),
			symlinkFiles(options, files.toLink)
		])
	})
}

function listAllFolderFiles(folder) {
	return !folder ? [] : globp('**', { cwd: path.normalize(folder) })
}

function filePathsToStats(rootFolder) {
	return function toStats(filePaths) {
		return Promise.all(filePaths.map(function(filePath) {
			return fstat(path.join(rootFolder, filePath)).then(function(stat) {
				return flstat(path.join(rootFolder, filePath)).then(function(lstat) {
					return {
						root: rootFolder,
						path: filePath,
						stat: stat,
						lstat: lstat
					}
				})
			})
		}))
	}
}

function mostRecentBackup(backupFolder) {
	return new Promise(function(resolve, reject) {
		fstat(backupFolder).then(function(stat) {
			if (!stat.isDirectory()) {
				var err = new Error('backup folder not found')
				err.backupFolderNotFound = true
				reject(err)
			} else {
				globp('*', { cwd: path.normalize(backupFolder) }).then(function(folders) {
					if (folders.length > 0) {
						resolve(folders.sort()[ folders.length - 1])
					} else {
						resolve()
					}
				})
			}
		})
	})
}

function pickTheImportantFiles(input) {
	var backupMap = input[1].reduce(function(previous, file) {
		previous[file.path] = file
		return previous
	}, {})
	return {
		toCopy: input[0].filter(function(file) {
			return !backupMap[file.path] || backupMap[file.path].stat.mtime < file.stat.mtime
		}),
		toLink: input[0].filter(function(file) {
			return backupMap[file.path] // && backupMap[file.path].mtime >= file.mtime
		})
	}
}

function continueOnlyIfThereAreFiles(options) {
	return function doTheLogic(files) {
		return new Promise(function(resolve, reject) {
			if (files.toCopy.length > 0 || options.forceVersionWhenEmpty) {
				resolve(files)
			} else {
				var err = new Error('no new files found to copy or symlink')
				err.noActionTaken = true
				reject(err)
			}
		})
	}
}

function createDirectoryStructure(options) {
	return function createDirectories(files) {
		return new Promise(function(resolve, reject) {
			var allDirectoryPaths = []
			.concat(files.toCopy)
			.concat(files.toLink)
			.filter(function onlyDirectories(file) {
				return file.stat.isDirectory()
			})
			.map(function(file) {
				return path.join(options.backupFolder, options.currentBackup, file.path)
			})
			.concat([ path.join(options.backupFolder, options.currentBackup) ])

			var directoryPromises = allDirectoryPaths.map(function(path) {
				return mkdirp(path)
			})
			Promise.all(directoryPromises)
				.then(function() {
					resolve(files)
				})
				.catch(function(err) {
					err.failureToCreateDirectory = true
					reject(err)
				})
		})
	}
}

function copyFiles(options, files) {
	return Promise.all(files.map(function(file) {
		return fcopy(path.join(options.fileFolder, file.path), path.join(options.backupFolder, options.currentBackup, file.path))
	}))
}

function symlinkFiles(options, files) {
	if (files) {
		var linkPromises = files.filter(function(file) {
			return !file.stat.isDirectory()
		}).map(function(file) {
			return {
				src: path.join(options.backupFolder, options.mostRecentBackup, file.path),
				dest: path.join(options.backupFolder, options.currentBackup, file.path)
			}
		}).map(function(file) {
			return flink(file.src, file.dest)
		})
		return Promise.all(linkPromises)
	} else {
		return false
	}
}
