const heroMedia = document.getElementById('heroMedia');

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
