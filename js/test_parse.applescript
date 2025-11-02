on run
	tell application "Google Chrome"
		set currentTab to active tab of window 1
		
		set simpleJS to "JSON.stringify((function() {
			var tiles = document.querySelectorAll('[data-index]');
			var count = 0;
			for (var i = 0; i < tiles.length; i++) count++;
			return {tiles: count};
		})());"
		
		set result to execute currentTab javascript simpleJS
		return result
	end tell
end run
