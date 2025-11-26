const DEFAULT_AVATARS = [
	"https://hc-cdn.hel1.your-objectstorage.com/s/v3/4183627c4d26c56c915e104a8a7374f43acd1733_pfp__1_.png",
	"https://hc-cdn.hel1.your-objectstorage.com/s/v3/389b1e6bd4248a7e5dd88e14c1adb8eb01267080_pfp__2_.png",
	"https://hc-cdn.hel1.your-objectstorage.com/s/v3/03011a5e59548191de058f33ccd1d1cb1d64f2a0_pfp__3_.png",
	"https://hc-cdn.hel1.your-objectstorage.com/s/v3/f9c57b88fbd4633114c1864bcc2968db555dbd2a_pfp__4_.png",
	"https://hc-cdn.hel1.your-objectstorage.com/s/v3/e61a8cabee5a749588125242747b65122fb94205_pfp.png",
];

/**
 * Returns a stable avatar URL for an IRC nick based on hash
 */
export function getAvatarForNick(nick: string): string {
	let hash = 0;
	for (let i = 0; i < nick.length; i++) {
		hash = (hash << 5) - hash + nick.charCodeAt(i);
		hash = hash & hash; // Convert to 32bit integer
	}
	return DEFAULT_AVATARS[Math.abs(hash) % DEFAULT_AVATARS.length] as string;
}
