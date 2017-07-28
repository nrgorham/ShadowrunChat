# Shadowrun Chat/Roller

About:

This is a really simple (and probably bad) client/server project that establishes a local webserver that hosts a chat room. In addition to some real basic chat commands, this also has some die rolling stuff to help play Shadowrun 5th edition.

I wanted to play around with node, socket.io and some sort of client library.

Commands:

Server-side:

'node server.js' to start the server, which will then listen on port 3000.

Client-side:

Connect via your favorite web browser and you get a chat room. The results of various commands are announced via text-to-speech because I thought it was funny.

Chat commands are as follows:

/nick [whatever] - Set your nickname. Will be persisted via html local storage and you'll attempt to reacquire the nickname on any reconnect.

/roll [\d]d - Roll the specified number of dice. Reports the number of successes (5s and 6s). Reports glitch and critical glitch results appropriately.

/init [\d]d+[\d] - Rolls the specified number of dice + a static modifier. 

/speech [on|off] - Toggles text-to-speech or sets it explicitly to on or off.




