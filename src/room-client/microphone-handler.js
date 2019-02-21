import * as stateActions from '../redux/stateActions'
import * as requestActions from '../redux/requestActions'
import { Logger } from '../logger'

const logger = new Logger('RoomClient::Microphone handler')

export default class MicrophoneHandler {
  constructor ({
    room,
    dispatch,
    transport,
    isMuted,
    isAllowedToProduce
  }) {
    if (!(room && dispatch && transport)) {
      throw new Error('MicrophoneHandler constructor: room, dispatch and transport are required!')
    }
    this._room = room
    this._dispatch = dispatch
    this._transport = transport
    this._isMuted = isMuted || false
    this._producer = null
    this._mics = null
    this._isAllowedToProduce = isAllowedToProduce || true
    this._isInitialized = false
  }

  /** Start microphone */
  async _activateMic () {
    if (!this._isAllowedToProduce) return 0
    logger.debug('activateMic()')

    this._dispatch(stateActions.setMicInProgress(true))

    try {
      await this._updateMics()
      await this._setMicProducer()
    } catch (error) {
      logger.error('activateMic() | failed: %o', error)
      this._dispatch(stateActions.setMicInProgress(false))
    }
  }

  /**
   * Updates microphone list
   * @return {Promise<MediaDeviceInfo[]>} promise with array of microphones
   */
  async _updateMics () {
    // if (!this._produce) return 0
    logger.debug('_updateMics()')

    // Reset the list.
    this._mics = new Map()

    logger.debug('_updateMics() | calling enumerateDevices()')
    const devices = await navigator.mediaDevices.enumerateDevices()

    for (const device of devices) {
      if (device.kind === 'audioinput') {
        this._mics.set(device.deviceId, device)
      }
    }

    await this._checkCurrentMicrophone()

    const array = Array.from(this._mics.values())
    logger.debug('_updateMics() [microphones:%o]', array)
    return array
  }

  async _checkCurrentMicrophone () {
    const array = Array.from(this._mics.values())
    const currentMicId = this._mic ? this._mic.deviceId : undefined

    if (array.length) {
      if (!this._mics.has(currentMicId)) {
        this._mic = array[0]
        await this.setMicrophone(array[0])
      }
    } else {
      this._mic = null
    }
  }

  /** Set up producer for microphone */
  async _setMicProducer () {
    if (!this._isAllowedToProduce) { return 0 }

    if (!this._room.canSend('audio')) {
      throw new Error('cannot send audio')
    }

    if (this._producer) {
      throw new Error('mic Producer already exists')
    }

    const device = this._mic
    const stream = await this._getMicrophoneStream(device)

    const track = stream.getAudioTracks()[0]

    const producer = await this._room.createProducer(track, null, { source: 'mic' })
    track.stop()

    /** disable audio if it's muted */
    if (this._isMuted) {
      producer.pause()
      this._isInitialized = true
    }

    this.producer = await this._sendProducerTransport(producer)

    this._setListeners()
    logger.debug('_setMicProducer() succeeded')
  }

  /**
   * sends transport data for producer and returns it if everything's fine
   * @param  {MediasoupProducer} producer
   * @return {MediasoupProducer}
   */
  async _sendProducerTransport (producer) {
    try {
      await producer.send(this._transport)

      this._dispatch(stateActions.addProducer({
        id: producer.id,
        source: 'mic',
        locallyPaused: producer.locallyPaused,
        remotelyPaused: producer.remotelyPaused,
        track: producer.track,
        codec: producer.rtpParameters.codecs[0].name
      }))

      return producer
    } catch (error) {
      logger.error('_sendProducerTransport() failed:%o', error)
      this._dispatch(requestActions.notify({
        text: `Mic producer failed: ${error.name}:${error.message}`
      }))
      return null
    }
  }

  /**
   * Set up producer event listener
   * @param  {MediasoupProducer} producer
   */
  _setListeners () {
    this._producer.on('close', (originator) => {
      logger.debug('mic Producer "close" event [originator:%s]', originator)
      this._producer = null
      this._dispatch(stateActions.removeProducer(this._producer.id))
    })

    this._producer.on('pause', (originator) => {
      logger.debug('mic Producer "pause" event [originator:%s]', originator)
      this._dispatch(stateActions.setProducerPaused(this._producer.id, originator))
    })

    this._producer.on('resume', (originator) => {
      logger.debug('mic Producer "resume" event [originator:%s]', originator)
      this._dispatch(stateActions.setProducerResumed(this._producer.id, originator))
    })

    this._producer.on('handled', () => {
      logger.debug('mic Producer "handled" event')
    })

    this._producer.on('unhandled', () => {
      logger.debug('mic Producer "unhandled" event')
    })
  }

  /**
   * Uses given MediaDeviceInfo and sets new microphone
   * @param  {MediaDeviceInfo} device Microphone device info
   * @return {Promise<void>}
   */
  async setMicrophone (device) {
    if (!device) { throw new Error('setMicrophone: no device provided') }
    if (device.kind !== 'audioinput') {
      throw new Error('setMicrophone: provided device is not microphone')
    }

    this._dispatch(
      stateActions.setMicInProgress(true))
    this._mic = device

    const stream = await this._getMicrophoneStream()
    const track = stream.getAudioTracks()[0]

    const newTrack = this._producer.replaceTrack(track)
    track.stop()

    this._dispatch(
      stateActions.setProducerTrack(this._producer.id, newTrack))
    this._dispatch(
      stateActions.setMicInProgress(false))
  }

  /**
   * Returns promise with stream of given microphone device
   * @param  {MediaDeviceInfo} device
   * @return {Promise<MediaStream>}
   */
  _getMicrophoneStream (device) {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: device.deviceId ? { exact: device.deviceId } : undefined
      },
      video: false
    })
  }

  muteMic () {
    logger.debug('muteMic()')
    this._is_audio_enabled = false
    this._producer.pause()
  }

  unmuteMic () {
    logger.debug('unmuteMic()')
    this._is_audio_enabled = true
    if (this._producer) {
      this._producer.resume()
    } else {
      this._setMicProducer()
    }
  }
}
