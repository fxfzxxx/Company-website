const heroMedia = document.getElementById('heroMedia');
const reveals = document.querySelectorAll('.reveal');

if (heroMedia) {
	const handleMove = (event) => {
		const rect = heroMedia.getBoundingClientRect();
		const x = (event.clientX - rect.left) / rect.width - 0.5;
		const y = (event.clientY - rect.top) / rect.height - 0.5;
		heroMedia.style.transform = `rotateX(${y * -6}deg) rotateY(${x * 8}deg)`;
	};

	const reset = () => {
		heroMedia.style.transform = 'rotateX(0deg) rotateY(0deg)';
	};

	heroMedia.addEventListener('mousemove', handleMove);
	heroMedia.addEventListener('mouseleave', reset);
}

if (reveals.length > 0) {
	const revealObserver = new IntersectionObserver(
		(entries, observer) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				entry.target.classList.add('is-visible');
				observer.unobserve(entry.target);
			});
		},
		{ threshold: 0.2 }
	);

	reveals.forEach((el) => revealObserver.observe(el));
}

const videoHero = document.getElementById('videoHero');

if (videoHero) {
	const onScroll = () => {
		const rect = videoHero.getBoundingClientRect();
		const offset = Math.max(-200, Math.min(200, rect.top - window.innerHeight / 2));
		const progress = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / (window.innerHeight + rect.height)));
		const opacity = Math.max(0, Math.min(1, progress * 1.2));
		const scale = 0.96 + progress * 0.04;
		videoHero.style.transform = `translateY(${offset * -0.12}px) scale(${scale})`;
		videoHero.style.opacity = opacity.toFixed(2);
		videoHero.style.filter = `brightness(${0.75 + progress * 0.25})`;
	};

	window.addEventListener('scroll', onScroll, { passive: true });
	onScroll();
}
