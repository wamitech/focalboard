// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import React from 'react'

import {Constants} from '../constants'

import './label.scss'

type Props = {
    color?: string
    title?: string
    children: React.ReactNode
    classNames?: string
}

// Switch is an on-off style switch / checkbox
function Label(props: Props): JSX.Element {
    let color = 'empty'
    if (Constants.menuColors.hasOwnProperty(props.color || '')) {
        color = props.color || 'empty'
    }
    return (
        <span
            className={`Label ${color} ${props.classNames ? props.classNames : ''}`}
            title={props.title}
        >
            {props.children}
        </span>
    )
}

export default React.memo(Label)
