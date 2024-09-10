import React, { ReactElement } from "react";

type EmptyObject = {
    [key: string]: any
}

type CustomAttributes = {
    [id: string]: ChildObject | any
}

type ChildObject = {
    children: React.ReactNode
}

export function convertToJSX(element: Node, customAttributes: CustomAttributes = {}): ReactElement | string | null {
    if (element.nodeType === Node.TEXT_NODE) {
        return element.textContent;
    }

    if (!(element instanceof Element)) {
        return null;
    }

    let props = {} as EmptyObject;
    for (const attr of element.attributes) {
        if (attr.name === "style") {
            const styleProps = attr.value.split(";").reduce((result: EmptyObject, prop) => {
                const [property, value] = prop.split(":");
                if (property && value) {
                    result[camelCase(property.trim())] = value.trim();
                }
                return result;
            }, {});
            props.style = styleProps;
        } else if (attr.name === 'class') {
            props['className'] = attr.value;
        } else {
            props[attr.name] = attr.value;
        }
    }

    if (Object.keys(customAttributes).includes(element.id)) {
        props = { ...props, ...customAttributes[element.id] };
    }

    const customChildren = customAttributes?.[element.id]?.children;

    const children = customChildren
        ? [customChildren]
        : Array.from(element.childNodes).map((child) =>
            convertToJSX(child, customAttributes)
        );
    
    return React.createElement(element.tagName.toLowerCase(), props, ...children);
}

function camelCase(inputString: string) {
    return inputString
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
}
