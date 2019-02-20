'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _extends2 = require('babel-runtime/helpers/extends');

var _extends3 = _interopRequireDefault(_extends2);

var _from = require('babel-runtime/core-js/array/from');

var _from2 = _interopRequireDefault(_from);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _map = require('babel-runtime/core-js/map');

var _map2 = _interopRequireDefault(_map);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _protooClient = require('protoo-client');

var _protooClient2 = _interopRequireDefault(_protooClient);

var _mediasoupClient = require('mediasoup-client');

var mediasoupClient = _interopRequireWildcard(_mediasoupClient);

var _axios = require('axios');

var _axios2 = _interopRequireDefault(_axios);

var _msr = require('msr');

var _msr2 = _interopRequireDefault(_msr);

var _Logger = require('./Logger');

var _Logger2 = _interopRequireDefault(_Logger);

var _urlFactory = require('./urlFactory');

var _requestActions = require('./redux/requestActions');

var requestActions = _interopRequireWildcard(_requestActions);

var _stateActions = require('./redux/stateActions');

var stateActions = _interopRequireWildcard(_stateActions);

var _screenShare = require('./room-components/screen-share.js');

var screenShare = _interopRequireWildcard(_screenShare);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var logger = new _Logger2.default('RoomClient');
// import * as cookiesManager from './cookiesManager';


var ROOM_OPTIONS = {
	requestTimeout: 10000,
	transportOptions: {
		tcp: true
	}
};

// let DEFAULT_VIDEO_CONSTRAINS =
// {
// 	qvga : { width: { ideal: 320 }, height: { ideal: 240 } },
// 	vga  : { width: { ideal: 640 }, height: { ideal: 480 } },
// 	hd   : { width: { ideal: 1280 }, height: { ideal: 720 } }
// };
//
// let DEFAULT_SIMULCAST_OPTIONS =
// {
// 	low : 100000,
// 	medium  : 300000,
// 	high   : 1500000
// };

var VIDEO_CONSTRAINS = [];
var SIMULCAST_OPTIONS = [];

var RoomClient = function () {
	function RoomClient(_ref) {
		var media_server_wss = _ref.media_server_wss,
		    roomId = _ref.roomId,
		    peerName = _ref.peerName,
		    displayName = _ref.displayName,
		    device = _ref.device,
		    useSimulcast = _ref.useSimulcast,
		    produce = _ref.produce,
		    dispatch = _ref.dispatch,
		    getState = _ref.getState,
		    turnservers = _ref.turnservers,
		    args = _ref.args;
		(0, _classCallCheck3.default)(this, RoomClient);

		logger.debug('constructor() [roomId:"%s", peerName:"%s", displayName:"%s", device:%s]', roomId, peerName, displayName, device.flag);
		var protooUrl = (0, _urlFactory.getProtooUrl)(media_server_wss, peerName, roomId);
		var protooTransport = new _protooClient2.default.WebSocketTransport(protooUrl);

		VIDEO_CONSTRAINS = args.video_constrains;
		SIMULCAST_OPTIONS = args.simulcast_options;

		this.initially_muted = args.initially_muted;
		this.is_audio_initialized = false;

		this._is_webcam_enabled = true;
		this._is_audio_enabled = !this.initially_muted;
		this._is_screenshare_enabled = true;
		this._screenStreamId = null;

		// Closed flag.
		this._closed = false;

		// Whether we should produce.
		this._produce = args.produce || produce;

		this._skip_consumer = args.skip_consumer;

		this._user_uuid = args.user_uuid;

		// Whether simulcast should be used.
		this._useSimulcast = useSimulcast;

		// Redux store dispatch function.
		this._dispatch = dispatch;

		// Redux store getState function.
		this._getState = getState;

		// My peer name.
		this._peerName = peerName;

		// protoo-client Peer instance.
		this._protoo = new _protooClient2.default.Peer(protooTransport);
		// set turn servers
		ROOM_OPTIONS.turnServers = turnservers;
		// mediasoup-client Room instance.
		this._room = new mediasoupClient.Room(ROOM_OPTIONS);

		//Инициализируем хранилище данных браузера пользователя
		this._storage = window.localStorage;

		// Transport for sending.
		this._sendTransport = null;

		// Transport for receiving.
		this._recvTransport = null;

		// Local mic mediasoup Producer.
		this._micProducer = null;

		// Local webcam mediasoup Producer.
		this._webcamProducer = null;

		this._videoRecorder = null;
		this._audioRecorder = null;
		this._recordState = 'inactive';
		this._recordIntervalFunc = null;

		// User screen capture mediasoup Producer.
		this._screenShareProducer = null;
		this._screenShareOriginalStream = null;

		// Map of webcam MediaDeviceInfos indexed by deviceId.
		// @type {Map<String, MediaDeviceInfos>}
		this._webcams = new _map2.default();

		//Список всех аудио-устройств ввода пользователя
		this._mics = new _map2.default();
		// Local Webcam. Object with:
		// - {MediaDeviceInfo} [device]
		// - {String} [resolution] - 'qvga' / 'vga' / 'hd'.
		this._webcam = {
			device: null,
			resolution: 'hd'
		};
		//Текущий микрофон пользователя
		this._mic = null;

		//_mediaRecorder = null;

		this._recordWorker;

		this._join({ displayName: displayName, device: device });
	}

	(0, _createClass3.default)(RoomClient, [{
		key: 'close',
		value: function close() {
			var _this = this;

			if (this._closed) return;

			this._closed = true;

			logger.debug('close()');
			this._room.producers.forEach(function (producer) {
				producer.track.stop();
			});
			// this.room._micProducer.track.stop()
			// this.room._webcamProducer.track.stop()
			// Leave the mediasoup Room.
			this._room.leave();

			// Close protoo Peer (wait a bit so mediasoup-client can send
			// the 'leaveRoom' notification).
			setTimeout(function () {
				return _this._protoo.close();
			}, 250);

			this._dispatch(stateActions.setRoomState('closed'));
		}
	}, {
		key: 'changeDisplayName',
		value: function changeDisplayName(displayName) {
			var _this2 = this;

			logger.debug('changeDisplayName() [displayName:"%s"]', displayName);

			// Store in cookie.
			// cookiesManager.setUser({ displayName });

			return this._protoo.send('change-display-name', { displayName: displayName }).then(function () {
				_this2._dispatch(stateActions.setDisplayName(displayName));

				_this2._dispatch(requestActions.notify({
					text: 'Display name changed'
				}));
			}).catch(function (error) {
				logger.error('changeDisplayName() | failed: %o', error);

				_this2._dispatch(requestActions.notify({
					type: 'error',
					text: 'Could not change display name: ' + error
				}));

				// We need to refresh the component for it to render the previous
				// displayName again.
				_this2._dispatch(stateActions.setDisplayName());
			});
		}
	}, {
		key: 'muteMic',
		value: function muteMic() {
			logger.debug('muteMic()');
			this._is_audio_enabled = false;
			this._micProducer.pause();
		}
	}, {
		key: 'unmuteMic',
		value: function unmuteMic() {
			logger.debug('unmuteMic()');
			this._is_audio_enabled = true;
			if (this._micProducer) {
				this._micProducer.resume();
			} else {
				this._setMicProducer();
			}
		}
	}, {
		key: 'enableWebcam',
		value: function enableWebcam() {
			logger.debug('enableWebcam()');
			this._is_webcam_enabled = true;
			this._activateWebcam();
		}
	}, {
		key: 'setScreenShare',
		value: function setScreenShare(streamId) {
			logger.debug("setScreenShare()");
			this._screenStreamId = streamId;
			if (!this._screenShareProducer) this._activateScreenShare();else this._changeScreenForShare();
		}
	}, {
		key: 'deactivateScreenShare',
		value: function deactivateScreenShare() {
			// logger.debug('deactivateScreenShare()');
			if (!this._screenShareProducer) {
				logger.error("Error! Screen share producer doesn't exist");
				// logger.debug("Error! Screen share producer doesn't exist");
				return false;
			}
			// if(this._screenShareOriginalStream) logger.debug('stream exists');
			this._screenShareOriginalStream.getTracks().forEach(function (track) {
				// logger.debug('track stopped');
				track.stop();
			});
			this._screenShareOriginalStream = null;
			if (this._screenShareProducer) this._screenShareProducer.close();
			this._screenShareProducer = null;
			logger.debug('producer deactivated successfully');
			return true;
		}

		// Геттер продюсера показа экрана

	}, {
		key: 'getScreenShareProducer',
		value: function getScreenShareProducer() {
			return this._screenShareProducer;
		}

		// Геттер потока показа экрана

	}, {
		key: 'getScreenShareStream',
		value: function getScreenShareStream() {
			return this._screenShareOriginalStream;
		}

		/** Запуск процесса захвата экрана */

	}, {
		key: '_activateScreenShare',
		value: async function _activateScreenShare() {
			logger.debug('activateScreenShare()');
			this._dispatch(stateActions.setScreenShareInProgress(true));

			try {
				console.error('poop');
				await this._setScreenShareProducer();
				console.error('sock');
				this._dispatch(stateActions.setScreenShareInProgress(false));
			} catch (error) {
				logger.error('activateScreenShare() | failed: %o', error);
				this._dispatch(stateActions.setScreenShareInProgress(false));
			}
		}

		//Запускаем микрофон

	}, {
		key: '_activateMic',
		value: function _activateMic() {
			var _this3 = this;

			logger.debug('activateMic()');
			//logger.debug('inside activate mic')

			this._dispatch(stateActions.setMicInProgress(true));

			return _promise2.default.resolve().then(function () {
				return _this3._updateMics();
			}).then(function () {
				return _this3._setMicProducer();
			}).then(function () {
				_this3._dispatch(stateActions.setMicInProgress(false));
			}).catch(function (error) {
				logger.error('activateWebcam() | failed: %o', error);

				_this3._dispatch(stateActions.setMicInProgress(false));
			});
		}

		//Запускаем вебкамеру

	}, {
		key: '_activateWebcam',
		value: function _activateWebcam() {
			var _this4 = this;

			logger.debug('activateWebcam()');

			// Store in cookie.
			// cookiesManager.setDevices({ webcamEnabled: true });
			this._dispatch(stateActions.setWebcamInProgress(true));

			return _promise2.default.resolve().then(function () {
				return _this4._updateWebcams();
			}).then(function () {
				return _this4._setWebcamProducer();
			}).then(function () {
				_this4._dispatch(stateActions.setWebcamInProgress(false));
			}).catch(function (error) {
				logger.error('activateWebcam() | failed: %o', error);

				_this4._dispatch(stateActions.setWebcamInProgress(false));
			});
		}
	}, {
		key: 'disableWebcam',
		value: function disableWebcam() {
			logger.debug('disableWebcam()');
			this._is_webcam_enabled = false;
			this._deactivateWebcam();
		}
	}, {
		key: '_deactivateWebcam',
		value: function _deactivateWebcam() {
			var _this5 = this;

			logger.debug('deactivateWebcam()');

			this._dispatch(stateActions.setWebcamInProgress(true));

			return _promise2.default.resolve().then(function () {
				_this5._webcamProducer.close();

				_this5._dispatch(stateActions.setWebcamInProgress(false));
			}).catch(function (error) {
				logger.error('deactivateWebcam() | failed: %o', error);

				_this5._dispatch(stateActions.setWebcamInProgress(false));
			});
		}
	}, {
		key: 'changeWebcam',
		value: function changeWebcam() {
			var _this6 = this;

			logger.debug('changeWebcam()');
			this._is_webcam_enabled = true;
			this._dispatch(stateActions.setWebcamInProgress(true));

			return _promise2.default.resolve().then(function () {
				return _this6._updateWebcams();
			}).then(function () {
				var array = (0, _from2.default)(_this6._webcams.keys());
				var len = array.length;
				var deviceId = _this6._webcam.device ? _this6._webcam.device.deviceId : undefined;
				var idx = array.indexOf(deviceId);

				if (idx < len - 1) idx++;else idx = 0;

				_this6._webcam.device = _this6._webcams.get(array[idx]);

				logger.debug('changeWebcam() | new selected webcam [device:%o]', _this6._webcam.device);

				// Reset video resolution to HD.
				_this6._webcam.resolution = 'hd';
			}).then(function () {
				var _webcam = _this6._webcam,
				    device = _webcam.device,
				    resolution = _webcam.resolution;


				if (!device) throw new Error('no webcam devices');

				logger.debug('changeWebcam() | calling getUserMedia()');

				return navigator.mediaDevices.getUserMedia({
					deviceId: { exact: device.deviceId },
					audio: false,
					video: (0, _extends3.default)({}, VIDEO_CONSTRAINS[resolution])
				});
			}).then(function (stream) {
				var track = stream.getVideoTracks()[0];

				return _this6._webcamProducer.replaceTrack(track).then(function (newTrack) {
					track.stop();

					return newTrack;
				});
			}).then(function (newTrack) {
				_this6._dispatch(stateActions.setProducerTrack(_this6._webcamProducer.id, newTrack));

				_this6._dispatch(stateActions.setWebcamInProgress(false));
			}).catch(function (error) {
				logger.error('changeWebcam() failed: %o', error);

				_this6._dispatch(stateActions.setWebcamInProgress(false));
			});
		}
	}, {
		key: 'setWebcamResulution',
		value: function setWebcamResulution(resolution) {
			var _this7 = this;

			// if (!this._is_webcam_enabled) return 0
			logger.debug('setWebcamResulution()');

			var oldResolution = void 0;
			var newResolution = void 0;

			this._dispatch(stateActions.setWebcamInProgress(true));

			return _promise2.default.resolve().then(function () {
				oldResolution = _this7._webcam.resolution;
				newResolution = resolution;

				_this7._webcam.resolution = newResolution;
			}).then(function () {
				var _webcam2 = _this7._webcam,
				    device = _webcam2.device,
				    resolution = _webcam2.resolution;


				logger.debug('setWebcamResulution() | calling getUserMedia()');

				return navigator.mediaDevices.getUserMedia({
					deviceId: { exact: device.deviceId },
					audio: false,
					video: (0, _extends3.default)({}, VIDEO_CONSTRAINS[resolution])
				});
			}).then(function (stream) {
				var track = stream.getVideoTracks()[0];

				return _this7._webcamProducer.replaceTrack(track).then(function (newTrack) {
					track.stop();

					return newTrack;
				});
			}).then(function (newTrack) {
				_this7._dispatch(stateActions.setProducerTrack(_this7._webcamProducer.id, newTrack));

				_this7._dispatch(stateActions.setWebcamInProgress(false));
			}).catch(function (error) {
				logger.error('changeWebcamResolution() failed: %o', error);

				_this7._dispatch(stateActions.setWebcamInProgress(false));

				_this7._webcam.resolution = oldResolution;
			});
		}
	}, {
		key: 'changeWebcamResolution',
		value: function changeWebcamResolution() {
			var _this8 = this;

			// if (!this._is_webcam_enabled) return 0
			logger.debug('changeWebcamResolution()');

			var oldResolution = void 0;
			var newResolution = void 0;

			this._dispatch(stateActions.setWebcamInProgress(true));

			return _promise2.default.resolve().then(function () {
				oldResolution = _this8._webcam.resolution;

				switch (oldResolution) {
					case 'qvga':
						newResolution = 'vga';
						break;
					case 'vga':
						newResolution = 'hd';
						break;
					case 'hd':
						newResolution = 'qvga';
						break;
				}

				_this8._webcam.resolution = newResolution;
			}).then(function () {
				var _webcam3 = _this8._webcam,
				    device = _webcam3.device,
				    resolution = _webcam3.resolution;


				logger.debug('changeWebcamResolution() | calling getUserMedia()');

				return navigator.mediaDevices.getUserMedia({
					deviceId: { exact: device.deviceId },
					audio: false,
					video: (0, _extends3.default)({}, VIDEO_CONSTRAINS[resolution])
				});
			}).then(function (stream) {
				var track = stream.getVideoTracks()[0];

				return _this8._webcamProducer.replaceTrack(track).then(function (newTrack) {
					track.stop();

					return newTrack;
				});
			}).then(function (newTrack) {
				_this8._dispatch(stateActions.setProducerTrack(_this8._webcamProducer.id, newTrack));

				_this8._dispatch(stateActions.setWebcamInProgress(false));
			}).catch(function (error) {
				logger.error('changeWebcamResolution() failed: %o', error);

				_this8._dispatch(stateActions.setWebcamInProgress(false));

				_this8._webcam.resolution = oldResolution;
			});
		}
	}, {
		key: 'enableAudioOnly',
		value: function enableAudioOnly() {
			var _this9 = this;

			logger.debug('enableAudioOnly()');

			this._dispatch(stateActions.setAudioOnlyInProgress(true));

			return _promise2.default.resolve().then(function () {
				if (_this9._webcamProducer) _this9._webcamProducer.close();

				var _iteratorNormalCompletion = true;
				var _didIteratorError = false;
				var _iteratorError = undefined;

				try {
					for (var _iterator = (0, _getIterator3.default)(_this9._room.peers), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
						var peer = _step.value;
						var _iteratorNormalCompletion2 = true;
						var _didIteratorError2 = false;
						var _iteratorError2 = undefined;

						try {
							for (var _iterator2 = (0, _getIterator3.default)(peer.consumers), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
								var consumer = _step2.value;

								if (consumer.kind !== 'video') continue;

								consumer.pause('audio-only-mode');
							}
						} catch (err) {
							_didIteratorError2 = true;
							_iteratorError2 = err;
						} finally {
							try {
								if (!_iteratorNormalCompletion2 && _iterator2.return) {
									_iterator2.return();
								}
							} finally {
								if (_didIteratorError2) {
									throw _iteratorError2;
								}
							}
						}
					}
				} catch (err) {
					_didIteratorError = true;
					_iteratorError = err;
				} finally {
					try {
						if (!_iteratorNormalCompletion && _iterator.return) {
							_iterator.return();
						}
					} finally {
						if (_didIteratorError) {
							throw _iteratorError;
						}
					}
				}

				_this9._dispatch(stateActions.setAudioOnlyState(true));

				_this9._dispatch(stateActions.setAudioOnlyInProgress(false));
			}).catch(function (error) {
				logger.error('enableAudioOnly() failed: %o', error);

				_this9._dispatch(stateActions.setAudioOnlyInProgress(false));
			});
		}
	}, {
		key: 'disableAudioOnly',
		value: function disableAudioOnly() {
			var _this10 = this;

			logger.debug('disableAudioOnly()');

			this._dispatch(stateActions.setAudioOnlyInProgress(true));

			return _promise2.default.resolve().then(function () {
				if (!_this10._webcamProducer && _this10._room.canSend('video')) return _this10._activateWebcam();
			}).then(function () {
				var _iteratorNormalCompletion3 = true;
				var _didIteratorError3 = false;
				var _iteratorError3 = undefined;

				try {
					for (var _iterator3 = (0, _getIterator3.default)(_this10._room.peers), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
						var peer = _step3.value;
						var _iteratorNormalCompletion4 = true;
						var _didIteratorError4 = false;
						var _iteratorError4 = undefined;

						try {
							for (var _iterator4 = (0, _getIterator3.default)(peer.consumers), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
								var consumer = _step4.value;

								if (consumer.kind !== 'video' || !consumer.supported) continue;

								consumer.resume();
							}
						} catch (err) {
							_didIteratorError4 = true;
							_iteratorError4 = err;
						} finally {
							try {
								if (!_iteratorNormalCompletion4 && _iterator4.return) {
									_iterator4.return();
								}
							} finally {
								if (_didIteratorError4) {
									throw _iteratorError4;
								}
							}
						}
					}
				} catch (err) {
					_didIteratorError3 = true;
					_iteratorError3 = err;
				} finally {
					try {
						if (!_iteratorNormalCompletion3 && _iterator3.return) {
							_iterator3.return();
						}
					} finally {
						if (_didIteratorError3) {
							throw _iteratorError3;
						}
					}
				}

				_this10._dispatch(stateActions.setAudioOnlyState(false));

				_this10._dispatch(stateActions.setAudioOnlyInProgress(false));
			}).catch(function (error) {
				logger.error('disableAudioOnly() failed: %o', error);

				_this10._dispatch(stateActions.setAudioOnlyInProgress(false));
			});
		}
	}, {
		key: 'restartIce',
		value: function restartIce() {
			var _this11 = this;

			logger.debug('restartIce()');

			this._dispatch(stateActions.setRestartIceInProgress(true));

			return _promise2.default.resolve().then(function () {
				_this11._room.restartIce();

				// Make it artificially longer.
				setTimeout(function () {
					_this11._dispatch(stateActions.setRestartIceInProgress(false));
				}, 500);
			}).catch(function (error) {
				logger.error('restartIce() failed: %o', error);

				_this11._dispatch(stateActions.setRestartIceInProgress(false));
			});
		}
	}, {
		key: '_join',
		value: function _join(_ref2) {
			var _this12 = this;

			var displayName = _ref2.displayName,
			    device = _ref2.device;

			this._dispatch(stateActions.setRoomState('connecting'));

			this._protoo.on('open', function () {
				logger.debug('protoo Peer "open" event');
				if (_this12._room._state != "joined") _this12._joinRoom({ displayName: displayName, device: device });
			});

			this._protoo.on('disconnected', function () {
				logger.warn('protoo Peer "disconnected" event');

				_this12._dispatch(requestActions.notify({
					type: 'error',
					text: 'WebSocket disconnected'
				}));

				// Leave Room.
				try {
					_this12._room.remoteClose({ cause: 'protoo disconnected' });
				} catch (error) {
					logger.error('Could\'t leave room: ' + error);
				}

				_this12._dispatch(stateActions.setRoomState('connecting'));
			});

			this._protoo.on('close', function () {
				if (_this12._closed) return;

				logger.warn('protoo Peer "close" event');

				if (_this12._room._state != "joined") _this12.close();
			});

			this._protoo.on("notification", function (notification) {
				switch (notification.method) {
					case 'active-speakers':
						var speakers = notification.data;

						global.emitter.emit('active-speakers', speakers);

						break;
					case 'active-speaker':
						var peerName = notification.data.peerName;


						_this12._dispatch(stateActions.setRoomActiveSpeaker(peerName));

						break;
					default:
						global.emitter.emit('notification', notification);
						break;
				}
				global.emitter.emit('notification');
			});

			this._protoo.on('request', function (request, accept, reject) {
				logger.debug('_handleProtooRequest() [method:%s, data:%o]', request.method, request.data);

				switch (request.method) {
					case 'mediasoup-notification':
						{
							accept();

							var notification = request.data;

							_this12._room.receiveNotification(notification);

							break;
						}

					case 'active-speaker':
						{
							accept();

							var peerName = request.data.peerName;


							_this12._dispatch(stateActions.setRoomActiveSpeaker(peerName));

							break;
						}

					case 'display-name-changed':
						{
							accept();

							// eslint-disable-next-line no-shadow
							var _request$data = request.data,
							    _peerName = _request$data.peerName,
							    _displayName = _request$data.displayName,
							    oldDisplayName = _request$data.oldDisplayName;

							// NOTE: Hack, we shouldn't do this, but this is just a demo.

							var peer = _this12._room.getPeerByName(_peerName);

							if (!peer) {
								logger.error('peer not found');

								break;
							}

							peer.appData.displayName = _displayName;

							_this12._dispatch(stateActions.setPeerDisplayName(_displayName, _peerName));

							_this12._dispatch(requestActions.notify({
								text: oldDisplayName + ' is now ' + _displayName
							}));

							break;
						}

					default:
						{
							logger.error('unknown protoo method "%s"', request.method);

							reject(404, 'unknown method');
						}
				}
			});
		}
	}, {
		key: '_joinRoom',
		value: function _joinRoom(_ref3) {
			var _this13 = this;

			var displayName = _ref3.displayName,
			    device = _ref3.device;

			logger.debug('_joinRoom()');

			// NOTE: We allow rejoining (room.join()) the same mediasoup Room when Protoo
			// WebSocket re-connects, so we must clean existing event listeners. Otherwise
			// they will be called twice after the reconnection.
			this._room.removeAllListeners();

			this._room.on('close', function (originator, appData) {
				if (originator === 'remote') {
					logger.warn('mediasoup Peer/Room remotely closed [appData:%o]', appData);

					_this13._dispatch(stateActions.setRoomState('closed'));

					return;
				}
			});

			this._room.on('request', function (request, callback, errback) {
				logger.debug('sending mediasoup request [method:%s]:%o', request.method, request);

				_this13._protoo.send('mediasoup-request', request).then(callback).catch(errback);
			});

			this._room.on('notify', function (notification) {
				logger.debug('sending mediasoup notification [method:%s]:%o', notification.method, notification);

				_this13._protoo.send('mediasoup-notification', notification).catch(function (error) {
					logger.warn('could not send mediasoup notification:%o', error);
				});
			});

			this._room.on('newpeer', function (peer) {
				logger.debug('room "newpeer" event [name:"%s", peer:%o]', peer.name, peer);

				_this13._handlePeer(peer);
			});

			this._room.join(this._peerName, { displayName: displayName, device: device }).then(function () {
				// Create Transport for sending.
				_this13._sendTransport = _this13._room.createTransport('send', { media: 'SEND_MIC_WEBCAM' });

				_this13._sendTransport.on('close', function (originator) {
					logger.debug('Transport "close" event [originator:%s]', originator);
				});

				// Create Transport for receiving.
				_this13._recvTransport = _this13._room.createTransport('recv', { media: 'RECV' });

				_this13._recvTransport.on('close', function (originator) {
					logger.debug('receiving Transport "close" event [originator:%s]', originator);
				});
			}).then(function () {
				// Set our media capabilities.
				_this13._dispatch(stateActions.setMediaCapabilities({
					canSendMic: _this13._room.canSend('audio'),
					canSendWebcam: _this13._room.canSend('video') //,
					//canSendScreenShare : this._room.canSend('screen')
				}));
			}).then(function () {
				// Don't produce if explicitely requested to not to do it.
				if (!_this13._produce) return 0;

				// NOTE: Don't depend on this Promise to continue (so we don't do return).
				_promise2.default.resolve()
				// Add our mic.
				.then(function () {
					if (!_this13._room.canSend('audio')) return;

					_this13._activateMic();
					// 	.catch(() => {});
				})
				// Add our webcam (unless the cookie says no).
				.then(function () {
					if (!_this13._room.canSend('video')) return;

					// const devicesCookie = cookiesManager.getDevices();

					// if (!devicesCookie || devicesCookie.webcamEnabled)
					_this13._activateWebcam();
				});
			}).then(function () {
				_this13._dispatch(stateActions.setRoomState('connected'));

				// Clean all the existing notifcations.
				_this13._dispatch(stateActions.removeAllNotifications());

				_this13._dispatch(requestActions.notify({
					text: 'You are in the room',
					timeout: 5000
				}));

				var peers = _this13._room.peers;

				var _iteratorNormalCompletion5 = true;
				var _didIteratorError5 = false;
				var _iteratorError5 = undefined;

				try {
					for (var _iterator5 = (0, _getIterator3.default)(peers), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
						var peer = _step5.value;

						_this13._handlePeer(peer, { notify: false });
					}
				} catch (err) {
					_didIteratorError5 = true;
					_iteratorError5 = err;
				} finally {
					try {
						if (!_iteratorNormalCompletion5 && _iterator5.return) {
							_iterator5.return();
						}
					} finally {
						if (_didIteratorError5) {
							throw _iteratorError5;
						}
					}
				}
			}).catch(function (error) {
				logger.error('_joinRoom() failed:%o', error);

				_this13._dispatch(requestActions.notify({
					type: 'error',
					text: 'Could not join the room: ' + error.toString()
				}));

				_this13.close();
			});
		}
	}, {
		key: '_setMicProducer',
		value: function _setMicProducer() {
			var _this14 = this;

			if (!this._produce) return 0;
			if (!this._room.canSend('audio')) {
				return _promise2.default.reject(new Error('cannot send audio'));
			}

			if (this._micProducer) {
				return _promise2.default.reject(new Error('mic Producer already exists'));
			}

			var producer = void 0;
			if (!this._micProducer) {
				return _promise2.default.resolve().then(function () {
					logger.debug('_setMicProducer() | calling getUserMedia()');

					return navigator.mediaDevices.getUserMedia({
						audio: {
							deviceId: _this14._mic.deviceId ? { exact: _this14._mic.deviceId } : undefined
						},
						video: false
					});
				}).then(function (stream) {
					var track = stream.getAudioTracks()[0];

					producer = _this14._room.createProducer(track, null, { source: 'mic' });

					//disable audio if it's muted
					if (!_this14._is_audio_enabled) {
						producer.pause();
						_this14.is_audio_initialized = true;
					}
					// No need to keep original track.
					track.stop();

					// Send it.
					return producer.send(_this14._sendTransport);
				}).then(function () {
					_this14._micProducer = producer;

					_this14._dispatch(stateActions.addProducer({
						id: producer.id,
						source: 'mic',
						locallyPaused: producer.locallyPaused,
						remotelyPaused: producer.remotelyPaused,
						track: producer.track,
						codec: producer.rtpParameters.codecs[0].name
					}));

					_this14.initProducerEventListener(producer, 'Mic');
				}).then(function () {
					logger.debug('_setMicProducer() succeeded');
				}).catch(function (error) {
					logger.error('_setMicProducer() failed:%o', error);

					_this14._dispatch(requestActions.notify({
						text: 'Mic producer failed: ' + error.name + ':' + error.message
					}));

					if (producer) producer.close();

					throw error;
				});
			} else {
				return this._micProducer;
			}
		}
	}, {
		key: '_setWebcamProducer',
		value: function _setWebcamProducer() {
			var _this15 = this;

			if (!this._produce) return 0;
			if (!this._is_webcam_enabled) return 0;

			// if (!this._room.canSend('video'))
			// {
			// 	return Promise.reject(
			// 		new Error('cannot send video'));
			// }

			if (this._webcamProducer) {
				return _promise2.default.reject(new Error('webcam Producer already exists'));
			}

			var producer = void 0;
			if (!this._room._webcamProducer) {
				return _promise2.default.resolve().then(function () {
					var _webcam4 = _this15._webcam,
					    device = _webcam4.device,
					    resolution = _webcam4.resolution;


					if (!device) throw new Error('no webcam devices');

					logger.debug('_setWebcamProducer() | calling getUserMedia()');

					// return navigator.mediaDevices.getUserMedia(
					// 	{
					// 		video :
					// 		{
					// 			deviceId : { exact: device.deviceId },
					// 			...VIDEO_CONSTRAINS[resolution]
					// 		}
					// 	});
					return navigator.mediaDevices.getUserMedia({
						deviceId: { exact: device.deviceId },
						audio: false,
						// ...VIDEO_CONSTRAINS[resolution],
						// video : true
						video: (0, _extends3.default)({}, VIDEO_CONSTRAINS[resolution])
					});
				}).then(function (stream) {
					var track = stream.getVideoTracks()[0];
					producer = _this15._room.createProducer(track, { simulcast: _this15._useSimulcast ? SIMULCAST_OPTIONS : false }, { source: 'webcam' });

					// No need to keep original track.
					track.stop();

					// Send it.
					return producer.send(_this15._sendTransport);
				}).then(function () {
					_this15._webcamProducer = producer;

					var device = _this15._webcam.device;


					_this15._dispatch(stateActions.addProducer({
						id: producer.id,
						source: 'webcam',
						deviceLabel: device.label,
						type: _this15._getWebcamType(device),
						locallyPaused: producer.locallyPaused,
						remotelyPaused: producer.remotelyPaused,
						track: producer.track,
						codec: producer.rtpParameters.codecs[0].name
					}));

					_this15.initProducerEventListener(producer, 'Webcam');
				}).then(function () {
					logger.debug('_setWebcamProducer() succeeded');
				}).catch(function (error) {
					logger.error('_setWebcamProducer() failed:%o', error);

					_this15._dispatch(requestActions.notify({
						text: 'Webcam producer failed: ' + error.name + ':' + error.message
					}));

					if (producer) producer.close();

					throw error;
				});
			} else {
				return this._room._webcamProducer;
			}
		}
	}, {
		key: '_changeScreenForShare',
		value: function _changeScreenForShare() {
			var _this16 = this;

			logger.debug('_changeScreenForShare()');

			this._is_screenshare_enabled = true;
			this._dispatch(stateActions.setScreenShareInProgress(true));

			return _promise2.default.resolve().then(function () {
				logger.debug('_changeScreenForShare() | calling getUserMedia()');
			}).then(function (stream) {
				_this16._screenShareOriginalStream = stream;
				var track = stream.getVideoTracks()[0];

				return _this16._screenShareProducer.replaceTrack(track).then(function (newTrack) {
					// track.stop();

					return newTrack;
				});
			}).then(function (newTrack) {
				_this16._dispatch(stateActions.setProducerTrack(_this16._screenShareProducer.id, newTrack));

				_this16._dispatch(stateActions.setScreenShareInProgress(false));
			}).catch(function (error) {
				logger.error('_changeScreenForShare() failed: %o', error);

				_this16._dispatch(stateActions.setScreenShareInProgress(false));
			});
		}

		/**
   * Создание продюсера для показа экрана
   * @returns {Promise}
   */

	}, {
		key: '_setScreenShareProducer',
		value: async function _setScreenShareProducer() {
			if (this._screenShareProducer) {
				throw 'screenshare Producer already exists';
			}

			console.error('before createProducer');

			var producer = await screenShare.createProducer(this._room, this._sendTransport, this._screenStreamId, this._useSimulcast ? SIMULCAST_OPTIONS : false);

			console.error('after createProducer');

			this.initProducerEventListener(producer, 'Screenshare');
			console.error('producer', producer);

			this._dispatch(stateActions.addProducer({
				id: producer.id,
				source: 'screen',
				locallyPaused: producer.locallyPaused,
				remotelyPaused: producer.remotelyPaused,
				track: producer.track,
				codec: producer.rtpParameters.codecs[0].name
			}));

			this._screenShareProducer = producer;
			logger.debug('_setScreenShareProducer() succeeded');
		}

		//Метод принимает MediaDeviceInfo и запоминает его в клиенте в зависимости от типа устройства

	}, {
		key: 'setDevice',
		value: async function setDevice(device) {
			if (!device) {
				return _promise2.default.reject(new Error('setDevice error: no device provided!'));
			}

			switch (device.kind) {
				case 'audioinput':
					logger.debug('TODO');
					break;
				case 'videoinput':
					await this.setVideoDevice(device);
					break;
				default:
					throw 'setDevice: wrong kind of device';
			}
		}
	}, {
		key: 'setVideoDevice',
		value: async function setVideoDevice(device) {
			if (!device) {
				throw 'setVideoDevice: no device provided';
			}
			if (device.kind !== 'videoinput') {
				throw 'setVideoDevice: wrong kind of device';
			}
			if (!device.deviceId) {
				throw 'setVideoDevice: device has no deviceId';
			}

			this._dispatch(stateActions.setWebcamInProgress(true));
			var resolution = this._webcam.resolution;

			var stream = await navigator.mediaDevices.getUserMedia({
				deviceId: device.deviceId,
				audio: false,
				video: (0, _extends3.default)({}, VIDEO_CONSTRAINS[resolution])
			});

			var track = stream.getVideoTracks()[0];

			var newTrack = await this._webcamProducer.replaceTrack(track);
			track.stop();

			this._dispatch(stateActions.setProducerTrack(this._webcamProducer.id, newTrack));

			this._dispatch(stateActions.setWebcamInProgress(false));
		}

		// 	if(device.kind === 'audioinput'){
		// 		return Promise.resolve()
		// 			.then( () => {
		// 				this._dispatch(
		// 					stateActions.setMicInProgress(true));
		// 			})
		// 			.then( () => {
		// 				this._mic = device;
		//
		// 				return navigator.mediaDevices.getUserMedia({
		// 					audio: {
		// 						deviceId: this._mic.deviceId ? {exact: this._mic.deviceId} : undefined
		// 					},
		// 					video:false
		// 				});
		// 			})
		// 			.then( (stream) => {
		// 				const track = stream.getAudioTracks()[0];
		//
		// 				return this._micProducer.replaceTrack(track)
		// 				.then((newTrack) =>
		// 				{
		// 					track.stop();
		//
		// 					return newTrack;
		// 				});
		// 			})
		// 			.then( (newTrack) => {
		// 				this._dispatch(
		// 					stateActions.setProducerTrack(this._micProducer.id, newTrack));
		//
		// 				this._dispatch(
		// 					stateActions.setMicInProgress(false));
		// 			})
		// 			.catch( (err) => {
		// 				logger.debug(err);
		// 			});
		// 	}

		/** Получить список вебкамер */

	}, {
		key: '_getVideoDevicesMap',
		value: async function _getVideoDevicesMap() {
			var webcams = new _map2.default();

			var devices = await navigator.mediaDevices.enumerateDevices();
			var _iteratorNormalCompletion6 = true;
			var _didIteratorError6 = false;
			var _iteratorError6 = undefined;

			try {
				for (var _iterator6 = (0, _getIterator3.default)(devices), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
					var device = _step6.value;

					if (device.kind === 'videoinput') {
						webcams.set(device.deviceId, device);
					}
				}
			} catch (err) {
				_didIteratorError6 = true;
				_iteratorError6 = err;
			} finally {
				try {
					if (!_iteratorNormalCompletion6 && _iterator6.return) {
						_iterator6.return();
					}
				} finally {
					if (_didIteratorError6) {
						throw _iteratorError6;
					}
				}
			}
		}
	}, {
		key: '_updateWebcams',
		value: async function _updateWebcams() {
			if (!this._produce) return 0;

			logger.debug('_updateWebcams()');

			// Reset the list.
			logger.debug('_updateWebcams() | calling enumerateDevices()');
			var webcams = await this._getVideoDevicesMap();

			var storageWebcam = this._storage.getItem('training-space-video-output-device-id');
			var array = (0, _from2.default)(this._webcams.values());

			if (this._webcams.has(storageWebcam)) {
				logger.debug('Обнаружена камера с ID:' + storageWebcam + " в localStorage");
				this._webcam.device = this._webcams.get(storageWebcam);
				return;
			}

			var len = array.length;
			var currentWebcamId = this._webcam.device ? this._webcam.device.deviceId : undefined;

			logger.debug('_updateWebcams() [webcams:%o]', array);

			if (len === 0) this._webcam.device = null;else if (!this._webcams.has(currentWebcamId)) this._webcam.device = array[0];

			this._dispatch(stateActions.setCanChangeWebcam(this._webcams.size >= 2));
		}
	}, {
		key: '_updateMics',
		value: function _updateMics() {
			var _this17 = this;

			if (!this._produce) return 0;

			logger.debug('_updateMics()');
			//logger.debug('inside updateMics()');

			// Reset the list.
			this._mics = new _map2.default();

			return _promise2.default.resolve().then(function () {
				logger.debug('_updateMics() | calling enumerateDevices()');

				return navigator.mediaDevices.enumerateDevices();
			}).then(function (devices) {
				var _iteratorNormalCompletion7 = true;
				var _didIteratorError7 = false;
				var _iteratorError7 = undefined;

				try {
					for (var _iterator7 = (0, _getIterator3.default)(devices), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
						var device = _step7.value;

						if (device.kind !== 'audioinput') continue;

						_this17._mics.set(device.deviceId, device);
					}
				} catch (err) {
					_didIteratorError7 = true;
					_iteratorError7 = err;
				} finally {
					try {
						if (!_iteratorNormalCompletion7 && _iterator7.return) {
							_iterator7.return();
						}
					} finally {
						if (_didIteratorError7) {
							throw _iteratorError7;
						}
					}
				}
			}).then(function () {
				var storageMic = _this17._storage.getItem('training-space-audio-input-device-id');
				var array = (0, _from2.default)(_this17._mics.values());

				if (_this17._mics.has(storageMic)) {
					//logger.debug('Обнаружен микрофон с ID:' + storageMic + " в localStorage");
					_this17._mic = _this17._mics.get(storageMic);
					return;
				}

				var len = array.length;
				var currentMicId = _this17._mic ? _this17._mic.deviceId : undefined;

				logger.debug('_updateMics() [microphones:%o]', array);

				if (len === 0) _this17._mic = null;else if (!_this17._mics.has(currentMicId)) _this17._mic = array[0];

				// this._dispatch(
				// 	stateActions.setCanChangeWebcam(this._mics.size > 1)
				// );
			}).catch(function (error) {
				logger.error('unexpected error while _updateMics:%o', error);
			});
		}
	}, {
		key: '_getWebcamType',
		value: function _getWebcamType(device) {
			if (/(back|rear)/i.test(device.label)) {
				logger.debug('_getWebcamType() | it seems to be a back camera');

				return 'back';
			} else {
				logger.debug('_getWebcamType() | it seems to be a front camera');

				return 'front';
			}
		}
	}, {
		key: '_handlePeer',
		value: function _handlePeer(peer) {
			var _this18 = this;

			var _ref4 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
			    _ref4$notify = _ref4.notify,
			    notify = _ref4$notify === undefined ? true : _ref4$notify;

			var displayName = peer.appData.displayName;

			this._dispatch(stateActions.addPeer({
				name: peer.name,
				displayName: displayName,
				device: peer.appData.device,
				consumers: []
			}));

			if (notify) {
				this._dispatch(requestActions.notify({
					text: displayName + ' joined the room'
				}));
			}

			var _iteratorNormalCompletion8 = true;
			var _didIteratorError8 = false;
			var _iteratorError8 = undefined;

			try {
				for (var _iterator8 = (0, _getIterator3.default)(peer.consumers), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
					var consumer = _step8.value;

					this._handleConsumer(consumer);
				}
			} catch (err) {
				_didIteratorError8 = true;
				_iteratorError8 = err;
			} finally {
				try {
					if (!_iteratorNormalCompletion8 && _iterator8.return) {
						_iterator8.return();
					}
				} finally {
					if (_didIteratorError8) {
						throw _iteratorError8;
					}
				}
			}

			peer.on('close', function (originator) {
				logger.debug('peer "close" event [name:"%s", originator:%s]', peer.name, originator);

				_this18._dispatch(stateActions.removePeer(peer.name));

				if (_this18._room.joined) {
					_this18._dispatch(requestActions.notify({
						text: peer.appData.displayName + ' left the room'
					}));
				}
			});

			peer.on('newconsumer', function (consumer) {
				logger.debug('peer "newconsumer" event [name:"%s", id:%s, consumer:%o]', peer.name, consumer.id, consumer);

				_this18._handleConsumer(consumer);
			});
		}
	}, {
		key: '_handleConsumer',
		value: function _handleConsumer(consumer) {
			var _this19 = this;

			if (this._skip_consumer && consumer.kind === 'audio') {
				return;
			}

			var codec = consumer.rtpParameters.codecs[0];

			this._dispatch(stateActions.addConsumer({
				id: consumer.id,
				peerName: consumer.peer.name,
				source: consumer.appData.source,
				supported: consumer.supported,
				locallyPaused: consumer.locallyPaused,
				remotelyPaused: consumer.remotelyPaused,
				track: null,
				codec: codec ? codec.name : null
			}, consumer.peer.name));

			consumer.on('close', function (originator) {
				logger.debug('consumer "close" event [id:%s, originator:%s, consumer:%o]', consumer.id, originator, consumer);

				_this19._dispatch(stateActions.removeConsumer(consumer.id, consumer.peer.name));
			});

			consumer.on('pause', function (originator) {
				logger.debug('consumer "pause" event [id:%s, originator:%s, consumer:%o]', consumer.id, originator, consumer);

				_this19._dispatch(stateActions.setConsumerPaused(consumer.id, originator));
			});

			consumer.on('resume', function (originator) {
				logger.debug('consumer "resume" event [id:%s, originator:%s, consumer:%o]', consumer.id, originator, consumer);

				_this19._dispatch(stateActions.setConsumerResumed(consumer.id, originator));
			});

			consumer.on('effectiveprofilechange', function (profile) {
				consumer.setPreferredProfile(profile);
				logger.debug('consumer "effectiveprofilechange" event [id:%s, consumer:%o, profile:%s]', consumer.id, consumer, profile);

				_this19._dispatch(stateActions.setConsumerEffectiveProfile(consumer.id, profile));
			});

			// Receive the consumer (if we can).
			if (consumer.supported) {
				// Pause it if video and we are in audio-only mode.
				if (consumer.kind === 'video' && this._getState().me.audioOnly) consumer.pause('audio-only-mode');

				consumer.receive(this._recvTransport).then(function (track) {
					_this19._dispatch(stateActions.setConsumerTrack(consumer.id, track));
				}).catch(function (error) {
					logger.error('unexpected error while receiving a new Consumer:%o', error);
				});
			}
		}
	}, {
		key: 'changeRecordSource',
		value: function changeRecordSource() {
			//TODO: переключение источника ввода видео
		}
	}, {
		key: 'record',
		value: function record(interval) {
			var _this20 = this;

			var dataType = { VIDEO: 'video', AUDIO: 'audio' };

			logger.debug("Starting Media Recorder...");
			var videoStream = new MediaStream(),
			    audioStream = new MediaStream();

			if (this._screenShareProducer) {
				videoStream.addTrack(this._screenShareProducer.track);
			} else if (this._webcamProducer) {
				videoStream.addTrack(this._webcamProducer.track);
			}
			if (this._micProducer) {
				audioStream.addTrack(this._micProducer.track);
			}

			var videoOptions = { mimeType: 'video/webcam; codecs=vp8' };
			var audioOptions = { mimeType: 'audio/ogg; codecs=opus' };

			this._videoRecorder = new _msr2.default(videoStream, videoOptions);
			this._audioRecorder = new _msr2.default(audioStream, audioOptions);

			// this._videoRecorder = new RecordRtc(videoStream, videoOptions);
			// this._audioRecorder = new RecordRtc(audioStream, audioOptions);

			this._videoRecorder.ondataavailable = function (blob) {
				uploadBlob(_this20._videoRecorder, blob, dataType.VIDEO);
			};

			this._audioRecorder.ondataavailable = function (blob) {
				uploadBlob(_this20._audioRecorder, blob, dataType.AUDIO);
			};

			_axios2.default.get('http://127.0.0.1:5000/begin').then(function (res) {
				logger.debug('Server is ready, start sending data...');

				_this20._recordState = 'recording';
				_this20._videoRecorder.start(interval);
				_this20._audioRecorder.start(interval);
			});

			function uploadBlob(recorder, blob, datatype, index) {
				var data = new FormData();
				data.append('name', datatype + '-' + index);
				data.append('file', blob);
				data.append('datatype', datatype);

				var url = 'http://127.0.0.1:5000/data-' + datatype;
				_axios2.default.post(url, data).then(function (res) {
					logger.debug(datatype + '-data blob sent.');
				}).catch(function (err) {
					logger.debug('error:' + err);
				});
			}
		}
	}, {
		key: 'stopRecord',
		value: function stopRecord() {
			logger.debug('Deactivating recorder...');
			this._recordState = 'inactive';
			this._audioRecorder.stop();
			this._videoRecorder.stop();
			setTimeout(this.finishRecord, 500);
		}
	}, {
		key: 'finishRecord',
		value: function finishRecord() {
			this._recordState = 'inactive';
			this._videoRecorder = null;
			this._audioRecorder = null;
			_axios2.default.get('http://127.0.0.1:5000/end').then(function (res) {
				logger.debug('Data transfer complete');
				return 5;
			});
		}
	}]);
	return RoomClient;
}();

exports.default = RoomClient;