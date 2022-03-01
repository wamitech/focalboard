// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import {Block, BlockPatch} from './blocks/block'
import {Board, BoardsAndBlocks, BoardsAndBlocksPatch, BoardPatch, BoardMember} from './blocks/board'
import {ISharing} from './blocks/sharing'
import {OctoUtils} from './octoUtils'
import {IUser, UserConfigPatch} from './user'
import {Utils} from './utils'
import {ClientConfig} from './config/clientConfig'
import {UserSettings} from './userSettings'
import {Category, CategoryBlocks} from './store/sidebar'
import {Team} from './store/teams'
import {Subscription} from './wsclient'
import {PrepareOnboardingResponse} from './onboardingTour'

//
// OctoClient is the client interface to the server APIs
//
class OctoClient {
    readonly serverUrl: string | undefined
    private logged = false

    // this need to be a function rather than a const because
    // one of the global variable (`window.baseURL`) is set at runtime
    // after the first instance of OctoClient is created.
    // Avoiding the race condition becomes more complex than making
    // the base URL dynamic though a function
    private getBaseURL(): string {
        const baseURL = (this.serverUrl || Utils.getBaseURL(true)).replace(/\/$/, '')

        // Logging this for debugging.
        // Logging just once to avoid log noise.
        if (!this.logged) {
            Utils.log(`OctoClient baseURL: ${baseURL}`)
            this.logged = true
        }

        return baseURL
    }

    get token(): string {
        return localStorage.getItem('focalboardSessionId') || ''
    }
    set token(value: string) {
        localStorage.setItem('focalboardSessionId', value)
    }

    constructor(serverUrl?: string, public teamId = '0') {
        this.serverUrl = serverUrl
    }

    private async getJson<T>(response: Response, defaultValue: T): Promise<T> {
        // The server may return null or malformed json
        try {
            const value = await response.json()
            return value || defaultValue
        } catch {
            return defaultValue
        }
    }

    async login(username: string, password: string): Promise<boolean> {
        const path = '/api/v1/login'
        const body = JSON.stringify({username, password, type: 'normal'})
        const response = await fetch(this.getBaseURL() + path, {
            method: 'POST',
            headers: this.headers(),
            body,
        })
        if (response.status !== 200) {
            return false
        }

        const responseJson = (await this.getJson(response, {})) as {token?: string}
        if (responseJson.token) {
            localStorage.setItem('focalboardSessionId', responseJson.token)
            return true
        }
        return false
    }

    async logout(): Promise<boolean> {
        const path = '/api/v1/logout'
        const response = await fetch(this.getBaseURL() + path, {
            method: 'POST',
            headers: this.headers(),
        })
        localStorage.removeItem('focalboardSessionId')

        if (response.status !== 200) {
            return false
        }
        return true
    }

    async getClientConfig(): Promise<ClientConfig | null> {
        const path = '/api/v1/clientConfig'
        const response = await fetch(this.getBaseURL() + path, {
            method: 'GET',
            headers: this.headers(),
        })
        if (response.status !== 200) {
            return null
        }

        const json = (await this.getJson(response, {})) as ClientConfig
        return json
    }

    async register(email: string, username: string, password: string, token?: string): Promise<{code: number, json: {error?: string}}> {
        const path = '/api/v1/register'
        const body = JSON.stringify({email, username, password, token})
        const response = await fetch(this.getBaseURL() + path, {
            method: 'POST',
            headers: this.headers(),
            body,
        })
        const json = (await this.getJson(response, {})) as {error?: string}
        return {code: response.status, json}
    }

    async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<{code: number, json: {error?: string}}> {
        const path = `/api/v1/users/${encodeURIComponent(userId)}/changepassword`
        const body = JSON.stringify({oldPassword, newPassword})
        const response = await fetch(this.getBaseURL() + path, {
            method: 'POST',
            headers: this.headers(),
            body,
        })
        const json = (await this.getJson(response, {})) as {error?: string}
        return {code: response.status, json}
    }

    private headers() {
        return {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: this.token ? 'Bearer ' + this.token : '',
            'X-Requested-With': 'XMLHttpRequest',
        }
    }

    // ToDo: delete
    /**
     * Generates workspace's path.
     * Uses workspace ID from `workspaceId` param is provided,
     * Else uses Client's workspaceID if available, else the user's last visited workspace ID.
     */
    // private workspacePath(workspaceId?: string) {
    //     let workspaceIdToUse = workspaceId
    //     if (!workspaceId) {
    //         workspaceIdToUse = this.workspaceId === '0' ? UserSettings.lastWorkspaceId || this.workspaceId : this.workspaceId
    //     }
    //
    //     return `/api/v1/workspaces/${workspaceIdToUse}`
    // }

    // ToDo: document
    private teamPath(teamId?: string): string {
        let teamIdToUse = teamId
        if (!teamId) {
            teamIdToUse = this.teamId === '0' ? UserSettings.lastTeamId || this.teamId : this.teamId
        }

        return `/api/v1/teams/${teamIdToUse}`
    }

    async getMe(): Promise<IUser | undefined> {
        const path = '/api/v1/users/me'
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return undefined
        }
        const user = (await this.getJson(response, {})) as IUser
        return user
    }

    async getUser(userId: string): Promise<IUser | undefined> {
        const path = `/api/v1/users/${encodeURIComponent(userId)}`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return undefined
        }
        const user = (await this.getJson(response, {})) as IUser
        return user
    }

    async patchUserConfig(userID: string, patch: UserConfigPatch): Promise<Record<string, string> | undefined> {
        const path = `/api/v1/users/${encodeURIComponent(userID)}/config`
        const body = JSON.stringify(patch)
        const response = await fetch(this.getBaseURL() + path, {
            headers: this.headers(),
            method: 'PUT',
            body,
        })

        if (response.status !== 200) {
            return undefined
        }

        return (await this.getJson(response, {})) as Record<string, string>
    }

    async getSubtree(boardId?: string, levels = 2, teamID?: string): Promise<Block[]> {
        let path = this.teamPath(teamID) + `/blocks/${encodeURIComponent(boardId || '')}/subtree?l=${levels}`
        const readToken = Utils.getReadToken()
        if (readToken) {
            path += `&read_token=${readToken}`
        }
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }
        const blocks = (await this.getJson(response, [])) as Block[]
        return this.fixBlocks(blocks)
    }

    // If no boardID is provided, it will export the entire archive
    async exportArchive(boardID = ''): Promise<Response> {
        const path = `/api/v1/boards/${boardID}/archive/export`
        return fetch(this.getBaseURL() + path, {headers: this.headers()})
    }

    async importFullArchive(file: File): Promise<Response> {
        const formData = new FormData()
        formData.append('file', file)

        const headers = this.headers() as Record<string, string>

        // TIPTIP: Leave out Content-Type here, it will be automatically set by the browser
        delete headers['Content-Type']

        return fetch(this.getBaseURL() + this.teamPath() + '/archive/import', {
            method: 'POST',
            headers,
            body: formData,
        })
    }

    async getBlocksWithParent(parentId: string, type?: string): Promise<Block[]> {
        let path: string
        if (type) {
            path = this.teamPath() + `/blocks?parent_id=${encodeURIComponent(parentId)}&type=${encodeURIComponent(type)}`
        } else {
            path = this.teamPath() + `/blocks?parent_id=${encodeURIComponent(parentId)}`
        }
        return this.getBlocksWithPath(path)
    }

    async getBlocksWithType(type: string): Promise<Block[]> {
        const path = this.teamPath() + `/blocks?type=${encodeURIComponent(type)}`
        return this.getBlocksWithPath(path)
    }

    async getBlocksWithBlockID(blockID: string, boardID: string, optionalReadToken?: string): Promise<Block[]> {
        let path = `/api/v1/boards/${boardID}/blocks?block_id=${blockID}`
        const readToken = optionalReadToken || Utils.getReadToken()
        if (readToken) {
            path += `&read_token=${readToken}`
        }
        return this.getBlocksWithPath(path)
    }

    async getAllBlocks(boardID: string): Promise<Block[]> {
        const path = `/api/v1/boards/${boardID}/blocks?all=true`
        return this.getBlocksWithPath(path)
    }

    private async getBlocksWithPath(path: string): Promise<Block[]> {
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }
        const blocks = (await this.getJson(response, [])) as Block[]
        return this.fixBlocks(blocks)
    }

    private async getBoardsWithPath(path: string): Promise<Board[]> {
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }
        const boards = (await this.getJson(response, [])) as Board[]
        return boards
    }

    private async getBoardMembersWithPath(path: string): Promise<BoardMember[]> {
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }
        const boardMembers = (await this.getJson(response, [])) as BoardMember[]
        return boardMembers
    }

    fixBlocks(blocks: Block[]): Block[] {
        if (!blocks) {
            return []
        }

        // Hydrate is important, as it ensures that each block is complete to the current model
        const fixedBlocks = OctoUtils.hydrateBlocks(blocks)

        return fixedBlocks
    }

    async patchBlock(boardId: string, blockId: string, blockPatch: BlockPatch): Promise<Response> {
        Utils.log(`patchBlock: ${blockId} block`)
        const body = JSON.stringify(blockPatch)
        return fetch(`${this.getBaseURL()}/api/v1/boards/${boardId}/blocks/${blockId}`, {
            method: 'PATCH',
            headers: this.headers(),
            body,
        })
    }

    async patchBlocks(blocks: Block[], blockPatches: BlockPatch[]): Promise<Response> {
        Utils.log(`patchBlocks: ${blocks.length} blocks`)
        const blockIds = blocks.map((block) => block.id)
        const body = JSON.stringify({block_ids: blockIds, block_patches: blockPatches})

        const path = this.getBaseURL() + this.teamPath() + '/blocks'
        const response = fetch(path, {
            method: 'PATCH',
            headers: this.headers(),
            body,
        })
        return response
    }

    async deleteBlock(boardId: string, blockId: string): Promise<Response> {
        Utils.log(`deleteBlock: ${blockId} on board ${boardId}`)
        return fetch(`${this.getBaseURL()}/api/v1/boards/${boardId}/blocks/${encodeURIComponent(blockId)}`, {
            method: 'DELETE',
            headers: this.headers(),
        })
    }

    async undeleteBlock(blockId: string): Promise<Response> {
        Utils.log(`undeleteBlock: ${blockId}`)
        return fetch(this.getBaseURL() + this.teamPath() + `/blocks/${encodeURIComponent(blockId)}/undelete`, {
            method: 'POST',
            headers: this.headers(),
        })
    }

    async followBlock(blockId: string, blockType: string, userId: string): Promise<Response> {
        const body: Subscription = {
            teamId: this.teamId,
            blockType,
            blockId,
            subscriberType: 'user',
            subscriberId: userId,
        }

        return fetch(this.getBaseURL() + '/api/v1/subscriptions', {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(body),
        })
    }

    async unfollowBlock(blockId: string, blockType: string, userId: string): Promise<Response> {
        return fetch(this.getBaseURL() + `/api/v1/subscriptions/${blockId}/${userId}`, {
            method: 'DELETE',
            headers: this.headers(),
        })
    }

    async insertBlock(boardId: string, block: Block): Promise<Response> {
        return this.insertBlocks(boardId, [block])
    }

    async insertBlocks(boardId: string, blocks: Block[], sourceBoardID?: string): Promise<Response> {
        Utils.log(`insertBlocks: ${blocks.length} blocks(s) on board ${boardId}`)
        blocks.forEach((block) => {
            Utils.log(`\t ${block.type}, ${block.id}, ${block.title?.substr(0, 50) || ''}`)
        })
        const body = JSON.stringify(blocks)
        return fetch(`${this.getBaseURL()}/api/v1/boards/${boardId}/blocks` + (sourceBoardID ? `?sourceBoardID=${encodeURIComponent(sourceBoardID)}` : ''), {
            method: 'POST',
            headers: this.headers(),
            body,
        })
    }

    async createBoardsAndBlocks(bab: BoardsAndBlocks): Promise<Response> {
        Utils.log(`createBoardsAndBlocks: ${bab.boards.length} board(s) ${bab.blocks.length} block(s)`)
        bab.boards.forEach((board: Board) => {
            Utils.log(`\t Board ${board.id}, ${board.type}, ${board.title?.substr(0, 50) || ''}`)
        })
        bab.blocks.forEach((block: Block) => {
            Utils.log(`\t Block ${block.id}, ${block.type}, ${block.title?.substr(0, 50) || ''}`)
        })

        const body = JSON.stringify(bab)
        return fetch(this.getBaseURL() + '/api/v1/boards-and-blocks', {
            method: 'POST',
            headers: this.headers(),
            body,
        })
    }

    async deleteBoardsAndBlocks(boardIds: string[], blockIds: string[]): Promise<Response> {
        Utils.log(`deleteBoardsAndBlocks: ${boardIds.length} board(s) ${blockIds.length} block(s)`)
        Utils.log(`\t Boards ${boardIds.join(', ')}`)
        Utils.log(`\t Blocks ${blockIds.join(', ')}`)

        const body = JSON.stringify({boards: boardIds, blocks: blockIds})
        return fetch(this.getBaseURL() + '/api/v1/boards-and-blocks', {
            method: 'DELETE',
            headers: this.headers(),
            body,
        })
    }

    // BoardMember
    async createBoardMember(member: BoardMember): Promise<Response> {
        Utils.log(`createBoardMember: user ${member.userId} and board ${member.boardId}`)

        const body = JSON.stringify(member)
        return fetch(this.getBaseURL() + `/api/v1/boards/${member.boardId}/members`, {
            method: 'POST',
            headers: this.headers(),
            body,
        })
    }

    async updateBoardMember(member: BoardMember): Promise<Response> {
        Utils.log(`udpateBoardMember: user ${member.userId} and board ${member.boardId}`)

        const body = JSON.stringify(member)
        return fetch(this.getBaseURL() + `/api/v1/boards/${member.boardId}/members/${member.userId}`, {
            method: 'PUT',
            headers: this.headers(),
            body,
        })
    }

    async deleteBoardMember(member: BoardMember): Promise<Response> {
        Utils.log(`deleteBoardMember: user ${member.userId} and board ${member.boardId}`)

        return fetch(this.getBaseURL() + `/api/v1/boards/${member.boardId}/members/${member.userId}`, {
            method: 'DELETE',
            headers: this.headers(),
        })
    }

    async patchBoardsAndBlocks(babp: BoardsAndBlocksPatch): Promise<Response> {
        Utils.log(`patchBoardsAndBlocks: ${babp.boardIDs.length} board(s) ${babp.blockIDs.length} block(s)`)
        Utils.log(`\t Board ${babp.boardIDs.join(', ')}`)
        Utils.log(`\t Blocks ${babp.blockIDs.join(', ')}`)

        const body = JSON.stringify(babp)
        return fetch(this.getBaseURL() + '/api/v1/boards-and-blocks', {
            method: 'PATCH',
            headers: this.headers(),
            body,
        })
    }

    // Sharing
    async getSharing(boardID: string): Promise<ISharing | undefined> {
        const path = `/api/v1/boards/${boardID}/sharing`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return undefined
        }
        return this.getJson(response, undefined)
    }

    async setSharing(boardID: string, sharing: ISharing): Promise<boolean> {
        const path = `/api/v1/boards/${boardID}/sharing`
        const body = JSON.stringify(sharing)
        const response = await fetch(
            this.getBaseURL() + path,
            {
                method: 'POST',
                headers: this.headers(),
                body,
            },
        )
        if (response.status !== 200) {
            return false
        }

        return true
    }

    // Workspace

    // async getWorkspace(): Promise<IWorkspace | undefined> {
    //     const path = this.workspacePath()
    //     const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
    //     if (response.status !== 200) {
    //         return undefined
    //     }
    //     const workspace = (await this.getJson(response, undefined)) as IWorkspace
    //     return workspace
    // }
    //

    async regenerateTeamSignupToken(): Promise<void> {
        const path = this.teamPath() + '/regenerate_signup_token'
        await fetch(this.getBaseURL() + path, {
            method: 'POST',
            headers: this.headers(),
        })
    }

    // Files

    // Returns fileId of uploaded file, or undefined on failure
    async uploadFile(rootID: string, file: File): Promise<string | undefined> {
        // IMPORTANT: We need to post the image as a form. The browser will convert this to a application/x-www-form-urlencoded POST
        const formData = new FormData()
        formData.append('file', file)

        try {
            const headers = this.headers() as Record<string, string>

            // TIPTIP: Leave out Content-Type here, it will be automatically set by the browser
            delete headers['Content-Type']

            const response = await fetch(this.getBaseURL() + this.teamPath() + '/' + rootID + '/files', {
                method: 'POST',
                headers,
                body: formData,
            })
            if (response.status !== 200) {
                return undefined
            }

            try {
                const text = await response.text()
                Utils.log(`uploadFile response: ${text}`)
                const json = JSON.parse(text)

                return json.fileId
            } catch (e) {
                Utils.logError(`uploadFile json ERROR: ${e}`)
            }
        } catch (e) {
            Utils.logError(`uploadFile ERROR: ${e}`)
        }

        return undefined
    }

    async getFileAsDataUrl(boardId: string, fileId: string): Promise<string> {
        let path = '/files/teams/' + this.teamId + '/' + boardId + '/' + fileId
        const readToken = Utils.getReadToken()
        if (readToken) {
            path += `?read_token=${readToken}`
        }
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return ''
        }
        const blob = await response.blob()
        return URL.createObjectURL(blob)
    }

    async getTeam(): Promise<Team | null> {
        const path = this.teamPath()
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return null
        }

        return this.getJson(response, null)
    }

    async getTeams(): Promise<Array<Team>> {
        const path = this.teamPath()
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }

        return this.getJson<Array<Team>>(response, [])
    }

    async getTeamUsers(): Promise<IUser[]> {
        const path = this.teamPath() + '/users'
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }
        return (await this.getJson(response, [])) as IUser[]
    }

    async searchTeamUsers(searchQuery: string): Promise<IUser[]> {
        const path = this.teamPath() + `/users?search=${searchQuery}`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }
        return (await this.getJson(response, [])) as IUser[]
    }

    async getTeamTemplates(teamId?: string): Promise<Board[]> {
        const path = this.teamPath(teamId) + '/templates'
        return this.getBoardsWithPath(path)
    }

    // Boards
    // ToDo: .
    // - goal? make the interface show boards & blocks for boards
    // - teams (maybe current team)? boards, members, user roles in the store, whatever that is
    // - selectors for boards, current team, board members
    // - ops to add/delete a board, add/delete board members, change roles? .
    // - WS definition and implementation

    async getBoards(): Promise<Board[]> {
        const path = this.teamPath() + '/boards'
        return this.getBoardsWithPath(path)
    }

    async getBoard(boardID: string): Promise<Board | undefined> {
        const path = `/api/v1/boards/${boardID}`
        const response = await fetch(this.getBaseURL() + path, {
            method: 'GET',
            headers: this.headers(),
        })

        if (response.status !== 200) {
            return undefined
        }

        return this.getJson<Board>(response, {} as Board)
    }

    async duplicateBoard(boardID: string, asTemplate: boolean, toTeam?: string): Promise<BoardsAndBlocks | undefined> {
        let query = '?asTemplate=false'
        if (asTemplate) {
            query = '?asTemplate=true'
        }
        if (toTeam) {
            query += `&toTeam=${encodeURIComponent(toTeam)}`
        }

        const path = `/api/v1/boards/${boardID}/duplicate${query}`
        const response = await fetch(this.getBaseURL() + path, {
            method: 'POST',
            headers: this.headers(),
        })

        if (response.status !== 200) {
            return undefined
        }

        return this.getJson<BoardsAndBlocks>(response, {} as BoardsAndBlocks)
    }

    async duplicateBlock(boardID: string, blockID: string, asTemplate: boolean): Promise<Block[] | undefined> {
        let query = '?asTemplate=false'
        if (asTemplate) {
            query = '?asTemplate=true'
        }
        const path = `/api/v1/boards/${boardID}/blocks/${blockID}/duplicate${query}`
        const response = await fetch(this.getBaseURL() + path, {
            method: 'POST',
            headers: this.headers(),
        })

        if (response.status !== 200) {
            return undefined
        }

        return this.getJson<Block[]>(response, [] as Block[])
    }

    async getBlocksForBoard(teamId: string, boardId: string): Promise<Board[]> {
        const path = this.teamPath(teamId) + `/boards/${boardId}`
        return this.getBoardsWithPath(path)
    }

    async getBoardMembers(teamId: string, boardId: string): Promise<BoardMember[]> {
        const path = `/api/v1/boards/${boardId}/members`
        return this.getBoardMembersWithPath(path)
    }

    async createBoard(board: Board): Promise<Response> {
        Utils.log(`createBoard: ${board.title} [${board.type}]`)
        return fetch(this.getBaseURL() + this.teamPath(board.teamId) + '/boards', {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(board),
        })
    }

    async patchBoard(boardId: string, boardPatch: BoardPatch): Promise<Response> {
        Utils.log(`patchBoard: ${boardId} board`)
        const body = JSON.stringify(boardPatch)
        return fetch(`${this.getBaseURL()}/api/v1/boards/${boardId}`, {
            method: 'PATCH',
            headers: this.headers(),
            body,
        })
    }

    async deleteBoard(boardId: string): Promise<Response> {
        Utils.log(`deleteBoard: ${boardId}`)
        return fetch(`${this.getBaseURL()}/api/v1/boards/${boardId}`, {
            method: 'DELETE',
            headers: this.headers(),
        })
    }

    async getSidebarCategories(teamID: string): Promise<Array<CategoryBlocks>> {
        const path = `/api/v1/teams/${teamID}/categories`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }

        return (await this.getJson(response, [])) as Array<CategoryBlocks>
    }

    async createSidebarCategory(category: Category): Promise<Response> {
        const path = `/api/v1/teams/${category.teamID}/categories`
        const body = JSON.stringify(category)
        return fetch(this.getBaseURL() + path, {
            method: 'POST',
            headers: this.headers(),
            body,
        })
    }

    async deleteSidebarCategory(teamID: string, categoryID: string): Promise<Response> {
        const url = `/api/v1/teams/${teamID}/categories/${categoryID}`
        return fetch(this.getBaseURL() + url, {
            method: 'DELETE',
            headers: this.headers(),
        })
    }

    async updateSidebarCategory(category: Category): Promise<Response> {
        const path = `/api/v1/teams/${category.teamID}/categories/${category.id}`
        const body = JSON.stringify(category)
        return fetch(this.getBaseURL() + path, {
            method: 'PUT',
            headers: this.headers(),
            body,
        })
    }

    async moveBlockToCategory(teamID: string, blockID: string, toCategoryID: string, fromCategoryID: string): Promise<Response> {
        const url = `/api/v1/teams/${teamID}/categories/${toCategoryID || '0'}/blocks/${blockID}`
        const payload = {
            fromCategoryID,
        }
        const body = JSON.stringify(payload)

        return fetch(this.getBaseURL() + url, {
            method: 'POST',
            headers: this.headers(),
            body,
        })
    }

    async search(teamID: string, query: string): Promise<Array<Board>> {
        const url = `${this.teamPath()}/boards/search?q=${encodeURIComponent(query)}`
        const response = await fetch(this.getBaseURL() + url, {
            method: 'GET',
            headers: this.headers(),
        })

        if (response.status !== 200) {
            return []
        }

        return (await this.getJson(response, [])) as Array<Board>
    }

    async getUserBlockSubscriptions(userId: string): Promise<Array<Subscription>> {
        const path = `/api/v1/subscriptions/${userId}`
        const response = await fetch(this.getBaseURL() + path, {headers: this.headers()})
        if (response.status !== 200) {
            return []
        }

        return (await this.getJson(response, [])) as Subscription[]
    }

    // onboarding
    async prepareOnboarding(): Promise<PrepareOnboardingResponse | undefined> {
        const path = '/api/v1/onboard'
        const response = await fetch(this.getBaseURL() + path, {
            headers: this.headers(),
            method: 'POST',
        })
        if (response.status !== 200) {
            return undefined
        }

        return (await this.getJson(response, [])) as PrepareOnboardingResponse
    }
}

const octoClient = new OctoClient()

export {OctoClient}
export default octoClient
