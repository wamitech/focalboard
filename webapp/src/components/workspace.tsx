// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import React, {useCallback, useEffect, useState, useContext} from 'react'
import {generatePath, useRouteMatch, useHistory} from 'react-router-dom'
import {FormattedMessage} from 'react-intl'

import {getCurrentBoard, isLoadingBoard, getTemplates} from '../store/boards'
import {refreshCards, getCardLimitTimestamp, getCurrentBoardHiddenCardsCount, setLimitTimestamp, getCurrentViewCardsSortedFilteredAndGrouped, setCurrent as setCurrentCard} from '../store/cards'
import {
    getCurrentBoardViews,
    getCurrentViewGroupBy,
    getCurrentViewId,
    getCurrentViewDisplayBy,
    getCurrentView,
} from '../store/views'
import {getCurrentPage, setCurrent as setCurrentPage} from '../store/pages'
import {useAppSelector, useAppDispatch} from '../store/hooks'

import isPagesContext from '../isPages'

import {getClientConfig, setClientConfig} from '../store/clientConfig'

import wsClient, {WSClient} from '../wsclient'
import {ClientConfig} from '../config/clientConfig'
import {Utils} from '../utils'
import {IUser} from '../user'
import propsRegistry from '../properties'

import {getMe, getMyConfig} from '../store/users'

import CenterPanel from './centerPanel'
import CenterPanelPages from './centerPanelPages'
import BoardTemplateSelector from './boardTemplateSelector/boardTemplateSelector'
import GuestNoBoards from './guestNoBoards'

import Sidebar from './sidebar/sidebar'

import './workspace.scss'

type Props = {
    readonly: boolean
}

function CenterContent(props: Props) {
    const isPages = useContext(isPagesContext)
    const isLoading = useAppSelector(isLoadingBoard)
    const match = useRouteMatch<{boardId: string, viewId: string, cardId?: string, channelId?: string}>()
    const board = useAppSelector(getCurrentBoard)
    const templates = useAppSelector(getTemplates)
    const cards = useAppSelector(getCurrentViewCardsSortedFilteredAndGrouped)
    const activeView = useAppSelector(getCurrentView)
    const activePage = useAppSelector(getCurrentPage)
    const views = useAppSelector(getCurrentBoardViews)
    const groupByProperty = useAppSelector(getCurrentViewGroupBy)
    const dateDisplayProperty = useAppSelector(getCurrentViewDisplayBy)
    const clientConfig = useAppSelector(getClientConfig)
    const hiddenCardsCount = useAppSelector(getCurrentBoardHiddenCardsCount)
    const cardLimitTimestamp = useAppSelector(getCardLimitTimestamp)
    const history = useHistory()
    const dispatch = useAppDispatch()
    const myConfig = useAppSelector(getMyConfig)
    const me = useAppSelector<IUser|null>(getMe)

    const isBoardHidden = () => {
        const hiddenBoardIDs = myConfig.hiddenBoardIDs?.value || {}
        return hiddenBoardIDs[board.id]
    }

    const showCard = useCallback((cardId?: string) => {
        const params = {...match.params, cardId}
        let newPath = generatePath(Utils.getBoardPagePath(match.path), params)
        if (props.readonly) {
            newPath += `?r=${Utils.getReadToken()}`
        }
        history.push(newPath)
        dispatch(setCurrentCard(cardId || ''))
    }, [match, history])

    const showPage = useCallback((pageId?: string) => {
        const params = {...match.params, viewId: pageId, cardId: undefined}
        let newPath = generatePath(Utils.getBoardPagePath(match.path), params)
        if (props.readonly) {
            newPath += `?r=${Utils.getReadToken()}`
        }
        history.push(newPath)
        dispatch(setCurrentPage(pageId || ''))
    }, [match, history])

    useEffect(() => {
        const onConfigChangeHandler = (_: WSClient, config: ClientConfig) => {
            dispatch(setClientConfig(config))
        }
        wsClient.addOnConfigChange(onConfigChangeHandler)

        const onCardLimitTimestampChangeHandler = (_: WSClient, timestamp: number) => {
            dispatch(setLimitTimestamp({timestamp, templates}))
            if (cardLimitTimestamp > timestamp) {
                dispatch(refreshCards(timestamp))
            }
        }
        wsClient.addOnCardLimitTimestampChange(onCardLimitTimestampChangeHandler)

        return () => {
            wsClient.removeOnConfigChange(onConfigChangeHandler)
        }
    }, [cardLimitTimestamp, match.params.boardId, templates])

    const templateSelector = (
        <BoardTemplateSelector
            title={
                <FormattedMessage
                    id='BoardTemplateSelector.plugin.no-content-title'
                    defaultMessage='Create a board'
                />
            }
            description={
                <FormattedMessage
                    id='BoardTemplateSelector.plugin.no-content-description'
                    defaultMessage='Add a board to the sidebar using any of the templates defined below or start from scratch.'
                />
            }
            channelId={match.params.channelId}
        />
    )

    if (match.params.channelId) {
        if (me?.is_guest) {
            return <GuestNoBoards/>
        }
        return templateSelector
    }

    if (board && !isBoardHidden() && (activeView || isPages)) {
        let property = groupByProperty
        if ((!property || !propsRegistry.get(property.type).canGroup) && activeView?.fields.viewType === 'board') {
            property = board?.cardProperties.find((o) => propsRegistry.get(o.type).canGroup)
        }

        let displayProperty = dateDisplayProperty
        if (!displayProperty && activeView?.fields.viewType === 'calendar') {
            displayProperty = board.cardProperties.find((o) => propsRegistry.get(o.type).isDate)
        }

        if (isPages) {
            return (
                <CenterPanelPages
                    clientConfig={clientConfig}
                    readonly={props.readonly}
                    board={board}
                    activePage={activePage}
                    showPage={showPage}
                />
            )
        }
        return (
            <CenterPanel
                clientConfig={clientConfig}
                readonly={props.readonly}
                board={board}
                cards={cards}
                shownCardId={match.params.cardId}
                showCard={showCard}
                activeView={activeView}
                groupByProperty={property}
                dateDisplayProperty={displayProperty}
                views={views}
                hiddenCardsCount={hiddenCardsCount}
            />
        )
    }

    if ((board && !isBoardHidden()) || isLoading) {
        return null
    }

    if (me?.is_guest) {
        return <GuestNoBoards/>
    }

    return templateSelector
}

const Workspace = (props: Props) => {
    const board = useAppSelector(getCurrentBoard)

    const viewId = useAppSelector(getCurrentViewId)
    const [boardTemplateSelectorOpen, setBoardTemplateSelectorOpen] = useState(false)

    const closeBoardTemplateSelector = useCallback(() => {
        setBoardTemplateSelectorOpen(false)
    }, [])
    const openBoardTemplateSelector = useCallback(() => {
        setBoardTemplateSelectorOpen(true)
    }, [])
    useEffect(() => {
        setBoardTemplateSelectorOpen(false)
    }, [board, viewId])

    return (
        <div className='Workspace'>
            {!props.readonly &&
                <Sidebar
                    onBoardTemplateSelectorOpen={openBoardTemplateSelector}
                    onBoardTemplateSelectorClose={closeBoardTemplateSelector}
                    onFolderCreate={() => null}
                    activeBoardId={board?.id}
                />
            }
            <div className='mainFrame'>
                {boardTemplateSelectorOpen &&
                    <BoardTemplateSelector onClose={closeBoardTemplateSelector}/>}
                {(board?.isTemplate) &&
                <div className='banner'>
                    <FormattedMessage
                        id='Workspace.editing-board-template'
                        defaultMessage="You're editing a board template."
                    />
                </div>}
                <CenterContent
                    readonly={props.readonly}
                />
            </div>
        </div>
    )
}

export default React.memo(Workspace)
