function Logger(topic: string, message: string) {
    const tbcStyle = 'color: #FFC107; font-weight: bold;';
    const defaultStyle = 'color: inherit; font-weight: normal;';
    console.debug(`%c★[TBC]%c ${topic} - ${message}`, tbcStyle, defaultStyle);
}