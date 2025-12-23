export type Board = {
  id: number;
  name: string;
  sortOrder: number;
  conferenceId: number;
};

export type Conference = {
  id: number;
  slug: string | null;
  name: string;
  sortOrder: number;
  isRoot: boolean;
  welcomeTitle: string;
  welcomeBody: string;
  menuTitle: string;
  menuBody: string;
  updatedAt: string;
  updatedBy: string;
};

export type ConferenceMenuActionType = "board" | "page" | "link" | "conference";

export type ConferenceMenuItem = {
  id: number;
  conferenceId: number;
  label: string;
  displayNo: string;
  displayType: string;
  actionType: ConferenceMenuActionType;
  actionRef: string;
  body: string;
  sortOrder: number;
  hidden: boolean;
  updatedAt: string;
  updatedBy: string;
};

export type PostSummary = {
  id: number;
  title: string;
  author: string;
  createdAt: string;
};

export type Post = {
  id: number;
  boardId: number;
  title: string;
  body: string;
  author: string;
  createdAt: string;
};
