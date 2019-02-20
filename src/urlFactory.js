import Logger from './Logger';

export function getProtooUrl(media_server_wss,peerName, roomId) {
	const logger = new Logger();
	// const url = `wss://${hostname}:3443/?peerName=${peerName}&roomId=${roomId}`;
	// const url = `wss://demo.mediasoup.org:3443/?peerName=${peerName}&roomId=${roomId}`;
	if (!media_server_wss) {
		logger.error("config.media_server_wss don't set.");
	}
	const url = media_server_wss+`/?peerName=${peerName}&roomId=${roomId}`;

	return url;
}
