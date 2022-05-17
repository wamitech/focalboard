// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createSlice, PayloadAction} from '@reduxjs/toolkit'

import {BoardsCloudLimits} from '../boardsCloudLimits'

import {initialLoad} from './initialLoad'

import {RootState} from './index'

type LimitsState = {
    limits: BoardsCloudLimits | undefined,
}

const initialState = {
    limits: {
        cards: 0,
        used_cards: 0,
        card_limit_timestamp: 0,
        views: 0,
    },
} as LimitsState

const limitsSlice = createSlice({
    name: 'limits',
    initialState,
    reducers: {
        setLimits: (state, action: PayloadAction<BoardsCloudLimits>) => {
            state.limits = action.payload
        },
    },
    extraReducers: (builder) => {
        builder.addCase(initialLoad.fulfilled, (state, action) => {
            state.limits = action.payload.limits
        })
    },
})

export const {reducer} = limitsSlice
export const getLimits = (state: RootState): BoardsCloudLimits | undefined => state.limits.limits
