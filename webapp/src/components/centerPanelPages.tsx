// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
/* eslint-disable max-lines */
import React, {useEffect, useMemo, useState} from 'react'
import {useIntl, IntlShape, FormattedMessage} from 'react-intl'

import {ClientConfig} from '../config/clientConfig'

import {Block, ContentBlockTypes, createBlock} from '../blocks/block'
import {Page} from '../blocks/page'
import {Board} from '../blocks/board'
import {IUser} from '../user'
import mutator from '../mutator'
import {Utils} from '../utils'
import {getCurrentPageContents} from '../store/contents'
import {getBoardUsers} from '../store/users'
import {updateContents} from '../store/contents'
import TelemetryClient, {TelemetryCategory, TelemetryActions} from '../../../webapp/src/telemetry/telemetryClient'
import CompassIcon from '../widgets/icons/compassIcon'
import IconButton from '../widgets/buttons/iconButton'
import GuestBadge from '../widgets/guestBadge'

import PageTitle from './pageTitle'
import PageMenu from './pageMenu'

import './centerPanelPages.scss'

import {useAppSelector, useAppDispatch} from '../store/hooks'
import {updatePages} from '../store/pages'

import {
    getMe,
} from '../store/users'

import octoClient from '../octoClient'

import ShareBoardButton from './shareBoard/shareBoardButton'
import ShareBoardLoginButton from './shareBoard/shareBoardLoginButton'

import BlocksEditor from './blocksEditor/blocksEditor'
import {BlockData} from './blocksEditor/blocks/types'

import ShareBoardTourStep from './onboardingTour/shareBoard/shareBoard'

const imageURLForUser = (window as any).Components?.imageURLForUser

type Props = {
    clientConfig?: ClientConfig
    board: Board
    activePage: Page
    readonly: boolean
    showPage: (pageId?: string) => void
}

async function addBlockNewEditor(page: Page, intl: IntlShape, title: string, fields: any, contentType: ContentBlockTypes, afterBlockId: string, dispatch: any): Promise<Block> {
    const block = createBlock()
    block.parentId = page.id
    block.boardId = page.boardId
    block.title = title
    block.type = contentType
    block.fields = {...block.fields, ...fields}

    const description = intl.formatMessage({id: 'CardDetail.addCardText', defaultMessage: 'add page text'})

    const afterRedo = async (newBlock: Block) => {
        const contentOrder = page.fields.contentOrder.slice()
        if (afterBlockId) {
            const idx = contentOrder.indexOf(afterBlockId)
            if (idx === -1) {
                contentOrder.push(newBlock.id)
            } else {
                contentOrder.splice(idx + 1, 0, newBlock.id)
            }
        } else {
            contentOrder.push(newBlock.id)
        }
        await octoClient.patchBlock(page.boardId, page.id, {updatedFields: {contentOrder}})
        dispatch(updatePages([{...page, fields: {...page.fields, contentOrder}}]))
    }

    const beforeUndo = async () => {
        const contentOrder = page.fields.contentOrder.slice()
        await octoClient.patchBlock(page.boardId, page.id, {updatedFields: {contentOrder}})
    }

    const newBlock = await mutator.insertBlock(block.boardId, block, description, afterRedo, beforeUndo)
    dispatch(updateContents([newBlock]))
    return newBlock
}


const CenterPanelPages = (props: Props) => {
    const intl = useIntl()
    const me = useAppSelector(getMe)
    const currentPageContents = useAppSelector(getCurrentPageContents)
    const folderUsersById = useAppSelector<{[key: string]: IUser}>(getBoardUsers)
    const dispatch = useAppDispatch()
    const [expanded, setExpanded] = useState(false)

    // empty dependency array yields behavior like `componentDidMount`, it only runs _once_
    // https://stackoverflow.com/a/58579462
    useEffect(() => {
        TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.ViewBoard, {board: props.board.id, page: props.activePage.id})
    }, [])

    const showShareButton = !props.readonly && me?.id !== 'single-user'
    const showShareLoginButton = props.readonly && me?.id !== 'single-user'

    const {activePage} = props

    const pageBlocks = useMemo(() => {
        return currentPageContents.flatMap((value: Block | Block[]): BlockData<any> => {
            const v: Block = Array.isArray(value) ? value[0] : value

            let data: any = v?.title
            if (v?.type === 'image') {
                data = {
                    file: v?.fields.fileId,
                }
            }

            if (v?.type === 'attachment') {
                data = {
                    file: v?.fields.fileId,
                    filename: v?.fields.filename,
                }
            }

            if (v?.type === 'video') {
                data = {
                    file: v?.fields.fileId,
                    filename: v?.fields.filename,
                }
            }

            if (v?.type === 'checkbox') {
                data = {
                    value: v?.title,
                    checked: v?.fields.value,
                }
            }

            return {
                id: v?.id,
                value: data,
                contentType: v?.type,
            }
        })
    }, [currentPageContents])

    const owner = folderUsersById[activePage.createdBy]

    let profileImg
    if (owner.id) {
        profileImg = imageURLForUser(owner.id)
    }

    return (
        <div
            className='PageComponent'
        >
            <div className='top-head'>
                <div className='mid-head'>
                    <div className='shareButtonWrapper'>
                        {showShareButton &&
                            <ShareBoardButton
                                enableSharedBoards={props.clientConfig?.enablePublicSharedBoards || false}
                            />}
                        {showShareLoginButton &&
                            <ShareBoardLoginButton/>}
                        <ShareBoardTourStep/>
                    </div>
                    <PageMenu
                        pageId={props.activePage?.id}
                        onClickDelete={async () => {
                            if (!props.activePage) {
                                Utils.assertFailure()
                                return
                            }
                            TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.DeletePage, {board: props.board.id, page: props.activePage.id})
                            await mutator.deleteBlock(props.activePage, 'delete page')
                            props.showPage(undefined)
                        }}
                        onClickDuplicate={async () => {
                            if (!props.activePage) {
                                Utils.assertFailure()
                                return
                            }
                            TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.DuplicatePage, {board: props.board.id, page: props.activePage.id})
                            await mutator.duplicatePage(
                                props.activePage.id,
                                props.board.id,
                                'duplicate page',
                                async (newPageId: string) => {
                                    props.showPage(newPageId)
                                },
                                async () => {
                                    props.showPage(props.activePage.id)
                                },
                            )
                        }}
                    />
                </div>
            </div>

            <div className={expanded ? 'content expanded' :  'content'}>
                <div className='doc-header'>
                    <div className='pages-breadcrumbs'>
                        {props.activePage ? `${props.board.title} / ${props.activePage.title}` : props.board.title}
                    </div>
                    <div className='expand-collapsed-button'>
                        <IconButton
                            size='small'
                            onClick={() => setExpanded(!expanded)}
                            icon={<CompassIcon icon={expanded ? 'arrow-collapse' : 'arrow-expand'}/>}
                        />
                    </div>
                </div>

                <PageTitle
                    page={activePage}
                    readonly={props.readonly}
                />

                <div className='page-author'>
                    <div className='person'>
                        {profileImg && (
                            <img
                                alt='Person-avatar'
                                src={profileImg}
                            />
                        )}
                        <FormattedMessage
                            id='Page.author'
                            defaultMessage='Created by {author} {badge}'
                            values={{
                                author: <b>{Utils.getUserDisplayName(owner, props.clientConfig?.teammateNameDisplay || '')}</b>,
                                badge: <GuestBadge show={Boolean(owner?.is_guest)}/>,
                            }}
                        />
                        {' - '}
                        <FormattedMessage
                            id='Page.author'
                            defaultMessage='Last updated: {date}'
                            values={{date: Utils.relativeDisplayDateTime(new Date(props.activePage.updateAt), intl)}}
                        />
                    </div>
                </div>

                <BlocksEditor
                    onBlockCreated={async (block: any, afterBlock: any): Promise<BlockData|null> => {
                        if (block.contentType === 'text' && block.value === '') {
                            return null
                        }
                        let newBlock: Block
                        if (block.contentType === 'checkbox') {
                            newBlock = await addBlockNewEditor(activePage, intl, block.value.value, {value: block.value.checked}, block.contentType, afterBlock?.id, dispatch)
                        } else if (block.contentType === 'image' || block.contentType === 'attachment' || block.contentType === 'video') {
                            const newFileId = await octoClient.uploadFile(activePage.boardId, block.value.file)
                            newBlock = await addBlockNewEditor(activePage, intl, '', {fileId: newFileId, filename: block.value.filename}, block.contentType, afterBlock?.id, dispatch)
                        } else {
                            newBlock = await addBlockNewEditor(activePage, intl, block.value, {}, block.contentType, afterBlock?.id, dispatch)
                        }
                        return {...block, id: newBlock.id}
                    }}
                    onBlockModified={async (block: any): Promise<BlockData<any>|null> => {
                        const originalContentBlock = currentPageContents.flatMap((b) => b).find((b) => b.id === block.id)
                        if (!originalContentBlock) {
                            return null
                        }

                        if (block.contentType === 'text' && block.value === '') {
                            const description = intl.formatMessage({id: 'ContentBlock.DeleteAction', defaultMessage: 'delete'})

                            mutator.deleteBlock(originalContentBlock, description)
                            return null
                        }
                        const newBlock = {
                            ...originalContentBlock,
                            title: block.value,
                        }

                        if (block.contentType === 'checkbox') {
                            newBlock.title = block.value.value
                            newBlock.fields = {...newBlock.fields, value: block.value.checked}
                        }
                        mutator.updateBlock(activePage.boardId, newBlock, originalContentBlock, intl.formatMessage({id: 'ContentBlock.editCardText', defaultMessage: 'edit card content'}))
                        return block
                    }}
                    onBlockMoved={async (block: BlockData, beforeBlock: BlockData|null, afterBlock: BlockData|null): Promise<void> => {
                        if (block.id) {
                            const idx = activePage.fields.contentOrder.indexOf(block.id)
                            let sourceBlockId: string
                            let sourceWhere: 'after'|'before'
                            if (idx === -1) {
                                Utils.logError('Unable to find the block id in the order of the current block')
                                return
                            }
                            if (idx === 0) {
                                sourceBlockId = activePage.fields.contentOrder[1] as string
                                sourceWhere = 'before'
                            } else {
                                sourceBlockId = activePage.fields.contentOrder[idx - 1] as string
                                sourceWhere = 'after'
                            }
                            if (afterBlock && afterBlock.id) {
                                await mutator.moveContentBlock(block.id, afterBlock.id, 'after', sourceBlockId, sourceWhere, intl.formatMessage({id: 'ContentBlock.moveBlock', defaultMessage: 'move card content'}))
                                return
                            }
                            if (beforeBlock && beforeBlock.id) {
                                await mutator.moveContentBlock(block.id, beforeBlock.id, 'before', sourceBlockId, sourceWhere, intl.formatMessage({id: 'ContentBlock.moveBlock', defaultMessage: 'move card content'}))
                            }
                        }
                    }}
                    blocks={pageBlocks}
                />
            </div>
        </div>
    )
}

export default React.memo(CenterPanelPages)
